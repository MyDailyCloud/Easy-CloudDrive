# Easy-CloudDrive

一个基于Cloudflare平台构建的云原生文件存储解决方案，无需传统服务器，完全利用Cloudflare Workers和R2存储服务。

## 项目简介

Easy-CloudDrive是一个轻量级云存储应用，专为Cloudflare平台设计，具有以下特点：

- **纯云原生架构**：基于Cloudflare Workers和R2存储服务构建
- **无服务器设计**：无需管理服务器，自动扩展，按使用付费
- **高性能**：利用Cloudflare全球边缘网络，提供低延迟的文件访问体验
- **简单易用**：直观的用户界面，支持文件上传、下载和管理
- **多语言支持**：内置中文、英文和韩文支持

## 核心功能

- 文件上传与下载
- 通过URL远程上传文件
- 文件列表管理
- 文件二维码分享
- 文件大小实时显示
- 完整的国际化支持

## 技术栈

- **前端**：HTML, CSS (Tailwind CSS), JavaScript (Vue.js)
- **后端**：Cloudflare Workers (JavaScript)
- **存储**：Cloudflare R2对象存储
- **部署**：Cloudflare Pages

## 快速开始

### 前提条件

- Cloudflare账户
- 已配置的R2存储桶
- Wrangler CLI（Cloudflare的命令行工具）

### 部署步骤

1. 克隆此仓库
   ```
   git clone https://github.com/yourusername/Easy-CloudDrive.git
   cd Easy-CloudDrive
   ```

2. 安装Wrangler CLI
   ```
   npm install -g wrangler
   ```

3. 登录到Cloudflare
   ```
   wrangler login
   ```

4. 在wrangler.toml文件中配置您的R2桶名称和环境变量
   ```toml
   [[r2_buckets]]
   binding = "fastdriver2"
   bucket_name = "你的R2桶名称"

   [vars]
   ppd = "设置访问密码"
   ```

5. 部署到Cloudflare Workers
   ```
   wrangler publish
   ```

## 环境变量

- `ppd`: 应用访问密码
- `fastdriver2`: R2存储桶的绑定名称

## 开发指南

### 本地开发

1. 使用Wrangler进行本地开发
   ```
   wrangler dev
   ```

2. 访问`http://localhost:8787`进行测试

### 项目结构

- `public/` - 前端静态文件
  - `index.html` - 主页面
  - `drive.html` - 文件管理页面
  - `i8n.js` - 国际化支持脚本
  - `i18n.json` - 多语言配置

- `functions/` - Cloudflare Workers函数
  - `uploadfile.js` - 处理文件上传
  - `uploadbyurl.js` - 处理URL文件上传
  - `getfilelist.js` - 获取文件列表

## 未来规划

查看我们的[改进计划](todo.md)了解未来开发路线图，包括：
- 文件夹支持
- 文件预览功能
- 用户认证系统
- 文件分享与协作
- 更多高级功能

## 贡献指南

欢迎提交Pull Request或Issue来帮助改进项目。请确保遵循以下步骤：
1. Fork此仓库
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启一个Pull Request

## 许可证

此项目采用MIT许可证 - 详情请查看[LICENSE](LICENSE)文件 