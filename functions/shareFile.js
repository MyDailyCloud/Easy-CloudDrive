export async function onRequest(context) {
  if (context.request.method !== 'POST' && context.request.method !== 'GET') {
    return new Response('不支持的请求方法', { status: 405 });
  }

  // 处理创建分享链接的请求
  if (context.request.method === 'POST') {
    return handleCreateShare(context);
  }

  // 处理访问分享链接的请求
  return handleAccessShare(context);
}

async function handleCreateShare(context) {
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

    // 解析请求体获取文件路径和分享设置
    const { filePath, expirationDays = 7, requirePassword = false, password: sharePassword = '' } = await context.request.json();

    if (!filePath) {
      return new Response('缺少文件路径', { status: 400 });
    }

    const bucket = context.env.fastdriver2;

    // 验证文件是否存在
    const object = await bucket.head(filePath);
    if (!object) {
      return new Response('文件不存在', { status: 404 });
    }

    // 生成分享ID (使用随机字符串)
    const shareId = generateShareId();
    
    // 计算过期时间
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + expirationDays);

    // 创建分享记录
    const shareRecord = {
      filePath,
      shareId,
      createdAt: new Date().toISOString(),
      expiresAt: expirationDate.toISOString(),
      requirePassword,
      password: sharePassword,
    };

    // 将分享记录存储在KV中
    await context.env.FILESHARES.put(shareId, JSON.stringify(shareRecord), {
      expirationTtl: expirationDays * 86400 // 转换为秒
    });

    // 生成分享链接
    const shareUrl = new URL(context.request.url);
    shareUrl.pathname = `/share`;
    shareUrl.search = `?id=${shareId}`;
    
    return new Response(JSON.stringify({
      success: true,
      shareId,
      shareUrl: shareUrl.toString(),
      expiresAt: expirationDate.toISOString(),
      requirePassword
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('创建分享失败:', error);
    return new Response(JSON.stringify({
      success: false,
      message: '创建分享失败',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleAccessShare(context) {
  try {
    const url = new URL(context.request.url);
    const shareId = url.searchParams.get('id');
    const inputPassword = url.searchParams.get('password') || '';

    if (!shareId) {
      return new Response('缺少分享ID', { status: 400 });
    }

    // 从KV中获取分享记录
    const shareRecordJson = await context.env.FILESHARES.get(shareId);
    if (!shareRecordJson) {
      return new Response('分享链接不存在或已过期', { status: 404 });
    }

    const shareRecord = JSON.parse(shareRecordJson);

    // 检查密码
    if (shareRecord.requirePassword && shareRecord.password !== inputPassword) {
      return new Response(JSON.stringify({
        success: false,
        message: '密码错误或未提供',
        requirePassword: true
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const bucket = context.env.fastdriver2;

    // 获取文件
    const file = await bucket.get(shareRecord.filePath);
    if (file === null) {
      return new Response('文件不存在', { status: 404 });
    }

    // 获取文件类型
    const contentType = file.httpMetadata?.contentType || 'application/octet-stream';

    // 设置文件下载响应头
    const headers = {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(shareRecord.filePath.split('/').pop())}"`,
      'Cache-Control': 'private, max-age=3600'
    };

    return new Response(file.body, { headers });
  } catch (error) {
    console.error('访问分享失败:', error);
    return new Response(JSON.stringify({
      success: false,
      message: '访问分享失败',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 生成随机分享ID
function generateShareId() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const length = 12;
  
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  return result;
} 