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
    const { folderPath } = await context.request.json();

    if (!folderPath) {
      return new Response('缺少文件夹路径', { status: 400 });
    }

    // 确保文件夹路径以斜杠结尾
    const normalizedPath = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
    
    const bucket = context.env.fastdriver2;

    // 在R2中，文件夹是通过创建一个空的占位符对象来表示的
    // 我们创建一个.folder文件来表示这是一个文件夹
    await bucket.put(`${normalizedPath}.folder`, new Uint8Array(0), {
      customMetadata: {
        'type': 'folder',
        'created': new Date().toISOString()
      }
    });

    return new Response(JSON.stringify({
      success: true,
      message: '文件夹创建成功',
      path: normalizedPath
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('文件夹创建失败:', error);
    return new Response(JSON.stringify({
      success: false,
      message: '文件夹创建失败',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 