[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Low')]
param(
    [Parameter(Mandatory = $true)]
    [string] $OrganizationUrl,

    [Parameter(Mandatory = $true)]
    [string] $Project,

    [Parameter(Mandatory = $true)]
    [Alias('FieldReferenceName')]
    [string] $SourceFieldReferenceName,

    [string] $TargetFieldReferenceName,

    [string] $ParentWorkItemType = 'User Story',

    [string] $ChildWorkItemType = 'Task',

    [string] $AccessToken = $env:SYSTEM_ACCESSTOKEN,

    [string] $PersonalAccessToken = $env:AZDO_PAT,

    [switch] $PreserveChildValueWhenParentEmpty,

    [switch] $PreserveChildValueWhenNoParent
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ScriptCmdlet = $PSCmdlet

$ApiVersion = '7.1'
$ParentRelationType = 'System.LinkTypes.Hierarchy-Reverse'

if ([string]::IsNullOrWhiteSpace($TargetFieldReferenceName)) {
    $TargetFieldReferenceName = $SourceFieldReferenceName
}

$OrganizationUrl = $OrganizationUrl.TrimEnd('/')
$ProjectSegment = [uri]::EscapeDataString($Project)
$ApiBase = "$OrganizationUrl/$ProjectSegment/_apis/wit"

if (-not [string]::IsNullOrWhiteSpace($AccessToken)) {
    $Headers = @{
        Authorization = "Bearer $AccessToken"
        Accept        = 'application/json'
    }
}
elseif (-not [string]::IsNullOrWhiteSpace($PersonalAccessToken)) {
    $bytes = [Text.Encoding]::ASCII.GetBytes(":$PersonalAccessToken")
    $encodedPat = [Convert]::ToBase64String($bytes)
    $Headers = @{
        Authorization = "Basic $encodedPat"
        Accept        = 'application/json'
    }
}
else {
    throw @'
No Azure DevOps credential was supplied.

Pipeline usage:
  Map $(System.AccessToken) to environment variable SYSTEM_ACCESSTOKEN.

Local usage:
  $env:AZDO_PAT = '<your PAT>'
  .\Sync-ParentFieldToChildren.ps1 ...
'@
}

function Get-RestErrorMessage {
    param(
        [Parameter(Mandatory = $true)]
        [System.Management.Automation.ErrorRecord] $ErrorRecord
    )

    $parts = @()

    if (-not [string]::IsNullOrWhiteSpace($ErrorRecord.Exception.Message)) {
        $parts += $ErrorRecord.Exception.Message
    }

    if ($null -ne $ErrorRecord.ErrorDetails -and
        -not [string]::IsNullOrWhiteSpace($ErrorRecord.ErrorDetails.Message)) {
        $parts += $ErrorRecord.ErrorDetails.Message
    }

    # PowerShell 7 usually places the Azure DevOps JSON error body in
    # ErrorDetails.Message. Keep a best-effort fallback for HttpResponseMessage.
    try {
        $response = $ErrorRecord.Exception.Response
        if ($null -ne $response -and $null -ne $response.Content) {
            $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            if (-not [string]::IsNullOrWhiteSpace($content)) {
                $parts += $content
            }
        }
    }
    catch {
        # Ignore diagnostics failures and return the information we already have.
    }

    return (@($parts | Select-Object -Unique) -join ' | ')
}

function Assert-FieldAvailableOnWorkItemType {
    param(
        [Parameter(Mandatory = $true)]
        [string] $WorkItemType,

        [Parameter(Mandatory = $true)]
        [string] $FieldReferenceName,

        [Parameter(Mandatory = $true)]
        [string] $Role
    )

    $typeSegment = [uri]::EscapeDataString($WorkItemType)
    $fieldSegment = [uri]::EscapeDataString($FieldReferenceName)
    $uri = "{0}/workitemtypes/{1}/fields/{2}?api-version={3}" -f $ApiBase, $typeSegment, $fieldSegment, $ApiVersion

    try {
        $field = Invoke-RestMethod -Method Get -Uri $uri -Headers $Headers
    }
    catch {
        $detail = Get-RestErrorMessage -ErrorRecord $_
        throw "Field '$FieldReferenceName' is not available on $Role work item type '$WorkItemType'. Add the existing field to that work item type in Organization Settings > Process, then run the sync again. Azure DevOps response: $detail"
    }

    if ($field.referenceName -ne $FieldReferenceName) {
        throw "Azure DevOps returned field '$($field.referenceName)' while '$FieldReferenceName' was requested on '$WorkItemType'."
    }

    Write-Host "Validated    : $WorkItemType contains $FieldReferenceName"
}

function Get-FieldState {
    param(
        [Parameter(Mandatory = $true)]
        [object] $WorkItem,

        [Parameter(Mandatory = $true)]
        [string] $ReferenceName
    )

    $property = $WorkItem.fields.PSObject.Properties[$ReferenceName]

    if ($null -eq $property) {
        return [pscustomobject]@{
            Exists = $false
            Value  = $null
        }
    }

    return [pscustomobject]@{
        Exists = $true
        Value  = $property.Value
    }
}

function Test-IsEmptyValue {
    param($Value)

    if ($null -eq $Value) {
        return $true
    }

    if ($Value -is [string]) {
        return [string]::IsNullOrWhiteSpace($Value)
    }

    return $false
}

function Test-IsScalarValue {
    param($Value)

    if ($null -eq $Value) {
        return $true
    }

    if ($Value -is [string] -or
        $Value -is [char] -or
        $Value -is [bool] -or
        $Value -is [byte] -or
        $Value -is [sbyte] -or
        $Value -is [int16] -or
        $Value -is [uint16] -or
        $Value -is [int32] -or
        $Value -is [uint32] -or
        $Value -is [int64] -or
        $Value -is [uint64] -or
        $Value -is [single] -or
        $Value -is [double] -or
        $Value -is [decimal] -or
        $Value -is [datetime] -or
        $Value -is [guid]) {
        return $true
    }

    return $false
}

function Test-ValuesEqual {
    param($Left, $Right)

    if ($null -eq $Left -and $null -eq $Right) {
        return $true
    }

    if ($null -eq $Left -or $null -eq $Right) {
        return $false
    }

    # The source and target normally use the same Azure DevOps field type.
    # JSON normalization preserves numeric/boolean values better than string casting.
    $leftJson = $Left | ConvertTo-Json -Compress -Depth 10
    $rightJson = $Right | ConvertTo-Json -Compress -Depth 10
    return $leftJson -ceq $rightJson
}

function Get-WorkItemsByIds {
    param(
        [Parameter(Mandatory = $true)]
        [int[]] $Ids,

        [switch] $IncludeRelations,

        [string[]] $Fields
    )

    if ($Ids.Count -eq 0) {
        return @()
    }

    $items = @()
    $batchSize = 200

    for ($offset = 0; $offset -lt $Ids.Count; $offset += $batchSize) {
        $end = [Math]::Min($offset + $batchSize - 1, $Ids.Count - 1)
        $batch = @($Ids[$offset..$end])
        $idsCsv = $batch -join ','

        if ($IncludeRelations) {
            $uri = "{0}/workitems?ids={1}&`$expand=relations&api-version={2}" -f $ApiBase, $idsCsv, $ApiVersion
        }
        elseif ($Fields -and $Fields.Count -gt 0) {
            $fieldsCsv = $Fields -join ','
            $uri = "{0}/workitems?ids={1}&fields={2}&api-version={3}" -f $ApiBase, $idsCsv, $fieldsCsv, $ApiVersion
        }
        else {
            $uri = "{0}/workitems?ids={1}&api-version={2}" -f $ApiBase, $idsCsv, $ApiVersion
        }

        $response = Invoke-RestMethod -Method Get -Uri $uri -Headers $Headers
        $items += @($response.value)
    }

    return $items
}

function Get-ParentId {
    param(
        [Parameter(Mandatory = $true)]
        [object] $Child
    )

    if ($null -eq $Child.relations) {
        return $null
    }

    $parentRelation = @($Child.relations | Where-Object { $_.rel -eq $ParentRelationType }) | Select-Object -First 1

    if ($null -eq $parentRelation) {
        return $null
    }

    if ($parentRelation.url -match '/workItems/(\d+)$') {
        return [int] $Matches[1]
    }

    throw "Could not extract parent ID from relation URL '$($parentRelation.url)' for work item $($Child.id)."
}

function Set-ChildFieldValue {
    param(
        [Parameter(Mandatory = $true)]
        [object] $Child,

        $DesiredValue,

        [Parameter(Mandatory = $true)]
        [bool] $RemoveValue
    )

    $targetState = Get-FieldState -WorkItem $Child -ReferenceName $TargetFieldReferenceName

    if ($RemoveValue) {
        if (-not $targetState.Exists -or (Test-IsEmptyValue $targetState.Value)) {
            return $false
        }

        $patch = @(
            @{
                op   = 'remove'
                path = "/fields/$TargetFieldReferenceName"
            }
        )
        $description = "clear $TargetFieldReferenceName"
    }
    else {
        if (-not (Test-IsScalarValue $DesiredValue)) {
            throw "Field '$SourceFieldReferenceName' on parent is not a scalar value. This script is intended for scalar fields such as string/picklist, number, boolean, date, or GUID fields."
        }

        if ($targetState.Exists -and (Test-ValuesEqual -Left $targetState.Value -Right $DesiredValue)) {
            return $false
        }

        # Azure DevOps' documented work-item field update examples use 'add'.
        # For a JSON object member, 'add' also replaces an existing value, so it
        # works for both initially-empty and already-populated work item fields.
        $patch = @(
            @{
                op    = 'add'
                path  = "/fields/$TargetFieldReferenceName"
                value = $DesiredValue
            }
        )
        $description = "set $TargetFieldReferenceName to '$DesiredValue'"
    }

    if ($ScriptCmdlet.ShouldProcess("Work item $($Child.id)", $description)) {
        $uri = "{0}/workitems/{1}?api-version={2}" -f $ApiBase, $Child.id, $ApiVersion
        $body = ConvertTo-Json -InputObject $patch -Depth 10

        try {
            Invoke-RestMethod `
                -Method Patch `
                -Uri $uri `
                -Headers $Headers `
                -ContentType 'application/json-patch+json' `
                -Body $body | Out-Null
        }
        catch {
            $detail = Get-RestErrorMessage -ErrorRecord $_
            throw "PATCH failed for work item $($Child.id), field '$TargetFieldReferenceName', desired value '$DesiredValue'. Request body: $body. Azure DevOps response: $detail"
        }
    }

    return $true
}

Write-Host "Azure DevOps parent-to-child field synchronization"
Write-Host "Organization : $OrganizationUrl"
Write-Host "Project      : $Project"
Write-Host "Hierarchy    : $ParentWorkItemType -> $ChildWorkItemType"
Write-Host "Field        : $SourceFieldReferenceName -> $TargetFieldReferenceName"
Write-Host ''

# Fail early with an actionable error when the source field is not part of the
# parent WIT or the target field has not been added to the child WIT. A field can
# exist at organization level while still not be available on a particular WIT.
Assert-FieldAvailableOnWorkItemType `
    -WorkItemType $ParentWorkItemType `
    -FieldReferenceName $SourceFieldReferenceName `
    -Role 'parent'

Assert-FieldAvailableOnWorkItemType `
    -WorkItemType $ChildWorkItemType `
    -FieldReferenceName $TargetFieldReferenceName `
    -Role 'child'

Write-Host ''

# Query only the child work item IDs. Relations and fields are fetched in batches afterwards.
$escapedChildType = $ChildWorkItemType.Replace("'", "''")
$wiql = @"
SELECT [System.Id]
FROM WorkItems
WHERE
    [System.TeamProject] = @Project
    AND [System.WorkItemType] = '$escapedChildType'
ORDER BY [System.Id]
"@

$wiqlUri = "{0}/wiql?api-version={1}" -f $ApiBase, $ApiVersion
$wiqlBody = @{ query = $wiql } | ConvertTo-Json
$wiqlResult = Invoke-RestMethod -Method Post -Uri $wiqlUri -Headers $Headers -ContentType 'application/json' -Body $wiqlBody
$childIds = @($wiqlResult.workItems | ForEach-Object { [int] $_.id })

if ($childIds.Count -eq 0) {
    Write-Host "No '$ChildWorkItemType' work items found. Nothing to do."
    return
}

Write-Host "Found $($childIds.Count) '$ChildWorkItemType' work items."

$children = @(Get-WorkItemsByIds -Ids $childIds -IncludeRelations)

$childToParent = @{}
$parentIds = @()
$noParentCount = 0

foreach ($child in $children) {
    $parentId = Get-ParentId -Child $child

    if ($null -eq $parentId) {
        $noParentCount++
        $childToParent[[string]$child.id] = $null
        continue
    }

    $childToParent[[string]$child.id] = $parentId
    $parentIds += $parentId
}

$parentIds = @($parentIds | Sort-Object -Unique)
Write-Host "Found $($parentIds.Count) unique parent work items; $noParentCount child work items have no parent."

$parentsById = @{}
if ($parentIds.Count -gt 0) {
    $parentFields = @('System.WorkItemType', 'System.Title', $SourceFieldReferenceName) | Sort-Object -Unique
    $parents = @(Get-WorkItemsByIds -Ids $parentIds -Fields $parentFields)

    foreach ($parent in $parents) {
        $parentsById[[string]$parent.id] = $parent
    }
}

$stats = [ordered]@{
    Checked          = 0
    Updated          = 0
    Unchanged        = 0
    Cleared          = 0
    NoParent         = 0
    WrongParentType  = 0
    MissingParent    = 0
    Errors           = 0
}

foreach ($child in $children) {
    $stats.Checked++
    $childId = [string]$child.id
    $parentId = $childToParent[$childId]

    try {
        if ($null -eq $parentId) {
            $stats.NoParent++

            if ($PreserveChildValueWhenNoParent) {
                Write-Host "SKIP    Task $($child.id): no parent; child value preserved."
                continue
            }

            $changed = Set-ChildFieldValue -Child $child -DesiredValue $null -RemoveValue $true
            if ($changed) {
                $stats.Updated++
                $stats.Cleared++
                Write-Host "CLEAR   $ChildWorkItemType $($child.id): no parent."
            }
            else {
                $stats.Unchanged++
            }
            continue
        }

        $parentKey = [string]$parentId
        if (-not $parentsById.ContainsKey($parentKey)) {
            $stats.MissingParent++
            Write-Warning "$ChildWorkItemType $($child.id): parent $parentId could not be retrieved."
            continue
        }

        $parent = $parentsById[$parentKey]
        $parentTypeState = Get-FieldState -WorkItem $parent -ReferenceName 'System.WorkItemType'

        if (-not $parentTypeState.Exists -or $parentTypeState.Value -ne $ParentWorkItemType) {
            $stats.WrongParentType++
            Write-Host "SKIP    $ChildWorkItemType $($child.id): parent $parentId is '$($parentTypeState.Value)', expected '$ParentWorkItemType'."
            continue
        }

        $sourceState = Get-FieldState -WorkItem $parent -ReferenceName $SourceFieldReferenceName
        $sourceIsEmpty = (-not $sourceState.Exists) -or (Test-IsEmptyValue $sourceState.Value)

        if ($sourceIsEmpty) {
            if ($PreserveChildValueWhenParentEmpty) {
                Write-Host "SKIP    $ChildWorkItemType $($child.id): parent $parentId has no value for $SourceFieldReferenceName; child value preserved."
                continue
            }

            $changed = Set-ChildFieldValue -Child $child -DesiredValue $null -RemoveValue $true
            if ($changed) {
                $stats.Updated++
                $stats.Cleared++
                Write-Host "CLEAR   $ChildWorkItemType $($child.id): parent $parentId has no $SourceFieldReferenceName value."
            }
            else {
                $stats.Unchanged++
            }
            continue
        }

        $targetState = Get-FieldState -WorkItem $child -ReferenceName $TargetFieldReferenceName
        if ($targetState.Exists -and (Test-ValuesEqual -Left $targetState.Value -Right $sourceState.Value)) {
            $stats.Unchanged++
            continue
        }

        $oldValue = if ($targetState.Exists) { $targetState.Value } else { '<empty>' }
        $changed = Set-ChildFieldValue -Child $child -DesiredValue $sourceState.Value -RemoveValue $false

        if ($changed) {
            $stats.Updated++
            Write-Host "UPDATE  $ChildWorkItemType $($child.id): '$oldValue' -> '$($sourceState.Value)' (parent $parentId)."
        }
        else {
            $stats.Unchanged++
        }
    }
    catch {
        $stats.Errors++
        Write-Error -ErrorAction Continue "$ChildWorkItemType $($child.id): $($_.Exception.Message)"
    }
}

Write-Host ''
Write-Host 'Synchronization summary'
Write-Host '-----------------------'
foreach ($entry in $stats.GetEnumerator()) {
    Write-Host ("{0,-17}: {1}" -f $entry.Key, $entry.Value)
}

if ($stats.Errors -gt 0) {
    throw "Synchronization completed with $($stats.Errors) error(s)."
}
