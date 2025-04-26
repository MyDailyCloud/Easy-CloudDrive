export async function onRequest(context) {
  const url = new URL(context.request.url);
  const action = url.searchParams.get("action");
  const path = url.searchParams.get("path") || "";
  const fileName = url.searchParams.get("fileName") || "";
  const fullKey = path ? 
    (path.endsWith('/') ? path + fileName : path + '/' + fileName) : 
    fileName;
  const bucket = context.env.fastdriver2;

  // 验证授权
  const authHeader = context.request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== context.env.ppd) {
    return new Response('授权失败', { status: 403 });
  }

  switch (context.request.method) {
    case "POST":
      switch (action) {
        case "mpu-create": {
          const body = await context.request.json();
          const fileNameFromBody = body.fileName || "";
          const pathFromBody = body.path || "";
          
          const keyToUse = pathFromBody ? 
            (pathFromBody.endsWith('/') ? pathFromBody + fileNameFromBody : pathFromBody + '/' + fileNameFromBody) : 
            fileNameFromBody;
            
          const multipartUpload = await bucket.createMultipartUpload(keyToUse || fullKey);
          return new Response(JSON.stringify({
            key: multipartUpload.key,
            uploadId: multipartUpload.uploadId,
          }));
        }
        case "mpu-complete": {
          const uploadId = url.searchParams.get("uploadId");
          if (!uploadId) {
            return new Response("缺少 uploadId", { status: 400 });
          }
          const multipartUpload = bucket.resumeMultipartUpload(fullKey, uploadId);
          const completeBody = await context.request.json();
          if (!completeBody || !completeBody.parts) {
            return new Response("请求体不完整", { status: 400 });
          }
          try {
            const object = await multipartUpload.complete(completeBody.parts);
            return new Response(null, {
              headers: { etag: object.httpEtag },
            });
          } catch (error) {
            return new Response(error.message, { status: 400 });
          }
        }
        default:
          return new Response(`未知的 POST 操作: ${action}`, { status: 400 });
      }
    case "PUT":
      if (action === "mpu-uploadpart") {
        const uploadId = url.searchParams.get("uploadId");
        const partNumberString = url.searchParams.get("partNumber");
        if (!partNumberString || !uploadId) {
          return new Response("缺少 partNumber 或 uploadId", { status: 400 });
        }
        if (!context.request.body) {
          return new Response("缺少请求体", { status: 400 });
        }
        const partNumber = parseInt(partNumberString);
        const multipartUpload = bucket.resumeMultipartUpload(fullKey, uploadId);
        try {
          const uploadedPart = await multipartUpload.uploadPart(partNumber, context.request.body);
          return new Response(JSON.stringify(uploadedPart));
        } catch (error) {
          return new Response(error.message, { status: 400 });
        }
      }
      return new Response(`未知的 PUT 操作: ${action}`, { status: 400 });
    case "DELETE":
      if (action === "mpu-abort") {
        const uploadId = url.searchParams.get("uploadId");
        if (!uploadId) {
          return new Response("缺少 uploadId", { status: 400 });
        }
        const multipartUpload = bucket.resumeMultipartUpload(fullKey, uploadId);
        try {
          await multipartUpload.abort();
          return new Response(null, { status: 204 });
        } catch (error) {
          return new Response(error.message, { status: 400 });
        }
      }
      return new Response(`未知的 DELETE 操作: ${action}`, { status: 400 });
    default:
      return new Response("不支持的请求方法", { status: 405 });
  }
}
