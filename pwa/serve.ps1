# خادم محلي بسيط لتجربة نسخة الويب بدون أي أدوات إضافية:
#   powershell -ExecutionPolicy Bypass -File pwa\serve.ps1
# ثم افتح http://localhost:8080 (والوحة التحكم على http://localhost:8080/admin/)
param([int]$Port = 8080)

$root = $PSScriptRoot
$types = @{
  ".html" = "text/html; charset=utf-8"; ".js" = "text/javascript; charset=utf-8"
  ".css" = "text/css; charset=utf-8"; ".json" = "application/json"
  ".webmanifest" = "application/manifest+json"; ".png" = "image/png"
  ".svg" = "image/svg+xml"; ".ico" = "image/x-icon"
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "RM TV: http://localhost:$Port/   Admin: http://localhost:$Port/admin/"

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart("/")
  if ($path -eq "" -or $path.EndsWith("/")) { $path += "index.html" }
  $file = [IO.Path]::GetFullPath((Join-Path $root $path))
  $res = $ctx.Response
  if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
    $bytes = [IO.File]::ReadAllBytes($file)
    $ext = [IO.Path]::GetExtension($file).ToLower()
    $res.ContentType = if ($types[$ext]) { $types[$ext] } else { "application/octet-stream" }
    $res.Headers.Add("Cache-Control", "no-cache")
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } elseif (Test-Path (Join-Path $root $path) -PathType Container) {
    $res.Redirect("/$path/")
  } else {
    $res.StatusCode = 404
  }
  $res.Close()
}
