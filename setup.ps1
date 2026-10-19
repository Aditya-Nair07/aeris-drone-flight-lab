$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$mambaPath = Join-Path $PSScriptRoot 'Library/bin/micromamba.exe'
if (-not (Test-Path -LiteralPath $mambaPath)) {
    Write-Host 'Downloading the free, open-source environment manager...'
    Invoke-WebRequest -Uri 'https://micro.mamba.pm/api/micromamba/win-64/latest' -OutFile 'micromamba.tar.bz2'
    tar -xf micromamba.tar.bz2 Library/bin/micromamba.exe
    if ($LASTEXITCODE -ne 0) { throw 'Unable to extract the environment manager.' }
}
& $mambaPath create -y -p (Join-Path $PSScriptRoot '.physics') -f environment.yml --no-rc
if ($LASTEXITCODE -ne 0) { throw 'Environment installation failed.' }
Write-Host 'Setup complete. Double-click START_SIMULATION.cmd.'
