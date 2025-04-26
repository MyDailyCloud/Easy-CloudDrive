export async function onRequest(context) {
  // 仅接受POST请求
  if (context.request.method !== 'POST') {
    return new Response('不支持的请求方法', { status: 405 });
  }

  try {
    // 从环境变量中获取密码
    const password = context.env.ppd;

    // 获取请求头中的 Authorization
    const authHeader = context.request.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response('未提供有效的授权令牌', { status: 401 });
    }

    const token = authHeader.split(' ')[1];

    // 比较令牌与密码
    if (token !== password) {
      return new Response('授权失败', { status: 403 });
    }

    // 解析请求体
    const { oldFileName, newFileName } = await context.request.json();

    if (!oldFileName || !newFileName) {
      return new Response('缺少必要参数', { status: 400 });
    }

    const bucket = context.env.fastdriver2;

    // 检查源文件是否存在
    const sourceObject = await bucket.head(oldFileName);
    if (sourceObject === null) {
      return new Response('源文件不存在', { status: 404 });
    }

    // 检查目标文件名是否已存在
    const targetObject = await bucket.head(newFileName);
    if (targetObject !== null) {
      return new Response('目标文件名已存在', { status: 409 });
    }

    // 从R2存储中获取源文件
    const sourceData = await bucket.get(oldFileName);
    if (sourceData === null) {
      return new Response('获取源文件失败', { status: 500 });
    }

    // 将源文件内容复制到新文件名
    await bucket.put(newFileName, await sourceData.arrayBuffer(), {
      httpMetadata: sourceData.httpMetadata,
      customMetadata: sourceData.customMetadata
    });

    // 删除原文件
    await bucket.delete(oldFileName);

    return new Response(JSON.stringify({
      success: true,
      message: '文件重命名成功',
      oldFileName,
      newFileName
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('文件重命名失败:', error);
    return new Response(JSON.stringify({
      success: false,
      message: '文件重命名失败',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 