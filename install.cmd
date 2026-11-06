@echo off
rem One-time setup: installs the `scribblr` command for Windows.
set "BIN=%~dp0bin"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$b='%BIN%'.TrimEnd('\'); $p=[Environment]::GetEnvironmentVariable('Path','User'); if(-not $p){$p=''}; if(($p -split ';') -notcontains $b){[Environment]::SetEnvironmentVariable('Path',($p.TrimEnd(';')+';'+$b).TrimStart(';'),'User')}"
call "%BIN%\scribblr.cmd" --prepare
echo [scribblr] Installed. Open a NEW terminal and run: scribblr
