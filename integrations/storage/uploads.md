# Private file uploads and downloads

Read this when changing file operations or delivery. For bucket, credential, and CORS setup, see [README.md](README.md).

## Upload lifecycle

The registered `/account` page uses a prepare/upload/confirm flow for profile photos:

1. Validate the filename, image content type, and size; create organization-scoped `pending`
   metadata and return a five-minute presigned POST.
2. Upload directly to S3, then confirm with `HeadObject`; mark `ready` only when metadata matches.
3. A delayed worker job retires abandoned uploads and cleans up failed or deleted objects.
4. `/account/avatar` re-checks ownership before redirecting to a short-lived signed inline URL.

Object keys and organization ownership always come from the server. Provider configuration lives
in [README.md](README.md).

The signing client uses the same region, credentials, and path-style setting as the storage client.
It falls back to `S3_ENDPOINT` when `S3_PUBLIC_ENDPOINT` is absent. URLs are signed for their final
endpoint; never rewrite them after signing.

## Delivery and CloudFront

The default private-file flow authorizes every download in the app and redirects to a five-minute
S3 signed URL with an attachment disposition. This is the simplest solid default.

For high-volume delivery, put CloudFront in front of the private bucket with Origin Access Control
and issue CloudFront signed URLs or cookies after the same organization authorization check. Keep
uploads pointed directly at S3; a CDN is a download optimization, not required storage
infrastructure.

## Profile photos

The protected `/account` page uses the same private upload lifecycle for JPEG, PNG, and WebP
photos up to 5 MiB. Avatar metadata is separate from ordinary files and is accessible only to the
owning account. `/account/avatar` authorizes the current
photo and redirects to a signed inline URL. Replaced and removed photos are retired and cleaned
up by the upload cleanup worker after outstanding upload signatures expire.
