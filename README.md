# 粉粉电子衣橱

纯前端本地化电子衣橱 PWA。应用会读取根目录下的 `上衣`、`外套`、`套装`、`裙子`、`裤子` 图片素材，生成轻量 WebP 资源后在浏览器中搭配、保存、编辑和删除橱窗搭配。

## 常用命令

```bash
npm install
npm run prepare:assets
npm run dev
npm run build
```

开发地址默认是 `http://localhost:5173/`。同一 Wi-Fi 下，手机可以打开终端里显示的 Network 地址，例如 `http://你的Mac局域网IP:5173/`。

## 安装到设备

- Mac：用 Chrome 或 Safari 打开部署后的 HTTPS 地址，选择安装/添加到程序坞。
- iPhone：用 Safari 打开部署后的 HTTPS 地址，点分享按钮，选择“添加到主屏幕”。
- 推荐部署：把 `dist/` 发布到 GitHub Pages。项目已使用相对路径构建，适合 GitHub Pages 的仓库子路径。

## 数据存储

搭配数据保存在浏览器 IndexedDB 中，包括搭配标题、布局数据和预览图。数据不会上传到服务器；换浏览器或清理浏览器数据会影响已保存搭配。
