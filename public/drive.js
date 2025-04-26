// 主应用Vue实例
new Vue({
  el: '#app',
  data: {
    files: [],
    showQR: false,
    currentFile: null,
    selectedFile: null,
    uploadProgress: 0,
    urlToUpload: '',
    uploadFileName: '',
    urlUploadFileName: '',
    selectedLanguage: 'zh',
    i18n: null,
    
    // 新增数据属性
    currentPath: '',
    breadcrumbs: [],
    searchQuery: '',
    searchResults: [],
    isSearchMode: false,
    showCreateFolder: false,
    newFolderName: '',
    pageSize: 50,
    currentCursor: null,
    hasMoreFiles: false,
    
    // 文件操作相关
    showRenameModal: false,
    renameFileName: '',
    renameNewName: '',
    
    // 文件分享相关
    showShareModal: false,
    shareFilePath: '',
    shareExpirationDays: 7,
    shareRequirePassword: false,
    sharePassword: '',
    shareUrl: '',
    showShareResult: false,
    
    // 文件预览相关
    showPreview: false,
    previewFile: null,
    previewType: '',
    previewContent: '',
    isPartialContent: false
  },
  
  computed: {
    // 面包屑导航
    pathSegments() {
      if (!this.currentPath) {
        return [];
      }
      
      // 移除尾部斜杠
      const path = this.currentPath.endsWith('/') 
        ? this.currentPath.slice(0, -1) 
        : this.currentPath;
      
      if (!path) return [];
      
      const segments = path.split('/');
      const result = [];
      
      let currentPath = '';
      for (let i = 0; i < segments.length; i++) {
        currentPath += segments[i] + '/';
        result.push({
          name: segments[i],
          path: currentPath
        });
      }
      
      return result;
    }
  },
  
  methods: {
    // 语言相关
    $t(key, params = {}) {
      if (!this.i18n) return key;
      
      const keys = key.split('.');
      let value = this.i18n;
      
      for (const k of keys) {
        if (!value[k]) return key;
        value = value[k];
      }
      
      if (typeof value === 'string') {
        // 替换参数
        return value.replace(/\{\{(\w+)\}\}/g, (_, paramName) => {
          return params[paramName] !== undefined ? params[paramName] : `{{${paramName}}}`;
        });
      }
      
      return key;
    },
    
    async changeLanguage() {
      this.i18n = await loadLanguage(this.selectedLanguage);
      this.updatePageText();
    },
    
    updatePageText() {
      document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const text = this.$t(key);
        
        if (element.tagName === 'INPUT' && element.getAttribute('placeholder')) {
          element.placeholder = text;
        } else {
          element.textContent = text;
        }
      });
    },
    
    // 获取文件列表
    async fetchFiles() {
      try {
        const endpoint = this.isSearchMode ? '/searchFiles' : '/getfilelist';
        const params = new URLSearchParams();
        
        if (this.isSearchMode) {
          params.append('query', this.searchQuery);
          params.append('path', this.currentPath);
        } else {
          params.append('path', this.currentPath);
          params.append('pageSize', this.pageSize);
          if (this.currentCursor) {
            params.append('cursor', this.currentCursor);
          }
        }
        
        const response = await fetch(`${endpoint}?${params.toString()}`);
        
        if (!response.ok) {
          throw new Error(this.$t('drive.messages.fetchError'));
        }
        
        const data = await response.json();
        
        if (this.isSearchMode) {
          this.searchResults = data.results || [];
        } else {
          this.files = data.files || [];
          this.currentCursor = data.cursor;
          this.hasMoreFiles = data.hasMore;
          this.updateBreadcrumbs();
        }
      } catch (error) {
        console.error('获取文件列表出错:', error);
        alert(this.$t('drive.messages.fetchError'));
      }
    },
    
    // 加载更多文件
    async loadMoreFiles() {
      if (!this.hasMoreFiles || this.isSearchMode) return;
      
      try {
        const params = new URLSearchParams();
        params.append('path', this.currentPath);
        params.append('pageSize', this.pageSize);
        params.append('cursor', this.currentCursor);
        
        const response = await fetch(`/getfilelist?${params.toString()}`);
        
        if (!response.ok) {
          throw new Error(this.$t('drive.messages.fetchError'));
        }
        
        const data = await response.json();
        this.files = [...this.files, ...(data.files || [])];
        this.currentCursor = data.cursor;
        this.hasMoreFiles = data.hasMore;
      } catch (error) {
        console.error('加载更多文件出错:', error);
      }
    },
    
    // 更新面包屑导航
    updateBreadcrumbs() {
      this.breadcrumbs = [{
        name: this.$t('drive.rootDirectory'),
        path: ''
      }];
      
      if (this.currentPath) {
        const paths = this.currentPath.split('/').filter(Boolean);
        let currentPath = '';
        
        for (const segment of paths) {
          currentPath += segment + '/';
          this.breadcrumbs.push({
            name: segment,
            path: currentPath
          });
        }
      }
    },
    
    // 文件夹导航
    navigateToFolder(folder) {
      this.currentPath = folder.name;
      this.currentCursor = null;
      this.isSearchMode = false;
      this.fetchFiles();
    },
    
    navigateToBreadcrumb(breadcrumb) {
      this.currentPath = breadcrumb.path;
      this.currentCursor = null;
      this.isSearchMode = false;
      this.fetchFiles();
    },
    
    navigateToParent() {
      if (!this.currentPath) return;
      
      const pathParts = this.currentPath.split('/').filter(Boolean);
      pathParts.pop();
      this.currentPath = pathParts.length ? pathParts.join('/') + '/' : '';
      this.currentCursor = null;
      this.isSearchMode = false;
      this.fetchFiles();
    },
    
    // 文件搜索
    async searchFiles() {
      if (!this.searchQuery.trim()) {
        this.isSearchMode = false;
        this.fetchFiles();
        return;
      }
      
      this.isSearchMode = true;
      await this.fetchFiles();
    },
    
    clearSearch() {
      this.searchQuery = '';
      this.isSearchMode = false;
      this.fetchFiles();
    },
    
    // 创建文件夹
    openCreateFolderModal() {
      this.showCreateFolder = true;
      this.newFolderName = '';
    },
    
    async createFolder() {
      if (!this.newFolderName.trim()) {
        alert(this.$t('drive.messages.enterFolderName'));
        return;
      }
      
      try {
        // 构建完整的文件夹路径
        const folderPath = this.currentPath + this.newFolderName;
        
        const response = await fetch('/createFolder', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ folderPath })
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || this.$t('drive.messages.folderCreateError'));
        }
        
        alert(this.$t('drive.messages.folderCreateSuccess'));
        this.showCreateFolder = false;
        this.fetchFiles();
      } catch (error) {
        console.error('创建文件夹失败:', error);
        alert(this.$t('drive.messages.folderCreateError'));
      }
    },
    
    // 文件重命名
    openRenameModal(file) {
      this.showRenameModal = true;
      this.renameFileName = file.name;
      
      // 获取文件名（不包括路径）
      const fileName = file.type === 'folder' 
        ? file.relativeName
        : file.relativeName;
        
      this.renameNewName = fileName;
    },
    
    async renameFile() {
      if (!this.renameNewName.trim()) {
        alert(this.$t('drive.messages.enterFileName'));
        return;
      }
      
      try {
        // 构建新的完整文件路径
        let newFileName;
        
        // 检查是否为文件夹
        if (this.renameFileName.endsWith('/')) {
          // 文件夹重命名
          const pathPrefix = this.renameFileName.substring(0, this.renameFileName.lastIndexOf('/', this.renameFileName.length - 2) + 1);
          newFileName = pathPrefix + this.renameNewName + '/';
        } else {
          // 文件重命名
          const pathPrefix = this.renameFileName.substring(0, this.renameFileName.lastIndexOf('/') + 1);
          newFileName = pathPrefix + this.renameNewName;
        }
        
        const response = await fetch('/renameFile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            oldFileName: this.renameFileName,
            newFileName
          })
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || this.$t('drive.messages.renameError'));
        }
        
        alert(this.$t('drive.messages.renameSuccess'));
        this.showRenameModal = false;
        this.fetchFiles();
      } catch (error) {
        console.error('重命名失败:', error);
        alert(error.message || this.$t('drive.messages.renameError'));
      }
    },
    
    // 文件删除
    async deleteFile(file) {
      if (!confirm(this.$t(file.type === 'folder' ? 'drive.messages.confirmDeleteFolder' : 'drive.messages.confirmDelete'))) {
        return;
      }
      
      try {
        const response = await fetch(`/deleteFile?path=${encodeURIComponent(file.name)}`, {
          method: 'DELETE'
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || this.$t('drive.messages.deleteError'));
        }
        
        alert(this.$t('drive.messages.deleteSuccess'));
        this.fetchFiles();
      } catch (error) {
        console.error('删除失败:', error);
        alert(error.message || this.$t('drive.messages.deleteError'));
      }
    },
    
    // 文件上传
    handleFileUpload(event) {
      this.selectedFile = event.target.files[0];
    },
    
    async uploadFile() {
      if (!this.selectedFile) {
        alert(this.$t('drive.messages.selectFile'));
        return;
      }

      const fileName = this.uploadFileName || this.selectedFile.name;
      const fileSize = this.selectedFile.size;
      const chunkSize = 10 * 1024 * 1024; // 10MB
      const totalChunks = Math.ceil(fileSize / chunkSize);

      try {
        // 创建多部分上传
        const createResponse = await fetch(`/uploadfile?action=mpu-create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            fileName, 
            path: this.currentPath 
          })
        });
        
        const { uploadId } = await createResponse.json();

        // 上传各个部分
        const uploadedParts = [];
        for (let i = 0; i < totalChunks; i++) {
          const start = i * chunkSize;
          const end = Math.min(start + chunkSize, fileSize);
          const chunk = this.selectedFile.slice(start, end);

          const partResponse = await fetch(`/uploadfile?action=mpu-uploadpart&uploadId=${uploadId}&partNumber=${i + 1}&path=${encodeURIComponent(this.currentPath)}&fileName=${encodeURIComponent(fileName)}`, {
            method: 'PUT',
            body: chunk
          });
          
          const partData = await partResponse.json();
          uploadedParts.push(partData);

          this.uploadProgress = Math.round((i + 1) / totalChunks * 100);
        }

        // 完成多部分上传
        const completeResponse = await fetch(`/uploadfile?action=mpu-complete&uploadId=${uploadId}&path=${encodeURIComponent(this.currentPath)}&fileName=${encodeURIComponent(fileName)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ parts: uploadedParts })
        });

        if (!completeResponse.ok) {
          throw new Error(this.$t('drive.messages.uploadError'));
        }

        alert(this.$t('drive.messages.uploadSuccess'));
        this.uploadFileName = '';
        this.uploadProgress = 0;
        this.fetchFiles();
      } catch (error) {
        console.error('上传文件出错:', error);
        alert(this.$t('drive.messages.uploadError'));
      }
    },
    
    // 通过URL上传文件
    async uploadFileByUrl() {
      if (!this.urlToUpload) {
        alert(this.$t('drive.messages.enterUrl'));
        return;
      }

      if (!this.urlUploadFileName) {
        alert(this.$t('drive.messages.enterFileName'));
        return;
      }

      try {
        const response = await fetch('/uploadbyurl', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: this.urlToUpload,
            path: this.currentPath,
            fileName: this.urlUploadFileName
          })
        });

        if (!response.ok) {
          throw new Error(this.$t('drive.messages.urlUploadError'));
        }

        alert(this.$t('drive.messages.urlUploadSuccess'));
        this.urlToUpload = '';
        this.urlUploadFileName = '';
        this.fetchFiles();
      } catch (error) {
        console.error('通过URL上传文件出错:', error);
        alert(this.$t('drive.messages.urlUploadError'));
      }
    },
    
    // 文件预览
    async previewFile(file) {
      if (file.type === 'folder') return;
      
      try {
        // 检查文件类型是否可预览
        const contentType = file.contentType || '';
        const isImage = contentType.startsWith('image/');
        const isPdf = contentType === 'application/pdf';
        const isText = contentType.startsWith('text/') || 
                      contentType === 'application/json' || 
                      contentType === 'application/xml';
        const isVideo = contentType.startsWith('video/');
        const isAudio = contentType.startsWith('audio/');
        
        if (!(isImage || isPdf || isText || isVideo || isAudio)) {
          alert(this.$t('drive.messages.previewNotSupported'));
          return;
        }
        
        // 获取预览类型
        if (isImage) this.previewType = 'image';
        else if (isPdf) this.previewType = 'pdf';
        else if (isText) this.previewType = 'text';
        else if (isVideo) this.previewType = 'video';
        else if (isAudio) this.previewType = 'audio';
        
        this.previewFile = file;
        this.showPreview = true;
        
        // 获取预览内容
        const response = await fetch(`/previewFile?file=${encodeURIComponent(file.name)}`);
        
        if (!response.ok) {
          throw new Error(this.$t('drive.messages.previewError'));
        }
        
        // 检查是否是部分内容
        this.isPartialContent = response.headers.get('X-Partial-Content') === 'true';
        
        if (this.previewType === 'text') {
          // 文本内容
          this.previewContent = await response.text();
        } else {
          // 二进制内容（图片、PDF等）
          const blob = await response.blob();
          this.previewContent = URL.createObjectURL(blob);
        }
      } catch (error) {
        console.error('预览文件失败:', error);
        alert(this.$t('drive.messages.previewError'));
        this.closePreview();
      }
    },
    
    closePreview() {
      this.showPreview = false;
      if (this.previewType !== 'text' && this.previewContent) {
        URL.revokeObjectURL(this.previewContent);
      }
      this.previewContent = '';
      this.previewFile = null;
      this.previewType = '';
      this.isPartialContent = false;
    },
    
    // 文件分享
    openShareModal(file) {
      this.shareFilePath = file.name;
      this.shareExpirationDays = 7;
      this.shareRequirePassword = false;
      this.sharePassword = '';
      this.showShareResult = false;
      this.shareUrl = '';
      this.showShareModal = true;
    },
    
    async shareFile() {
      try {
        const response = await fetch('/shareFile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            filePath: this.shareFilePath,
            expirationDays: parseInt(this.shareExpirationDays),
            requirePassword: this.shareRequirePassword,
            password: this.sharePassword
          })
        });
        
        if (!response.ok) {
          throw new Error(this.$t('drive.messages.shareError'));
        }
        
        const result = await response.json();
        this.shareUrl = result.shareUrl;
        this.showShareResult = true;
      } catch (error) {
        console.error('分享文件失败:', error);
        alert(this.$t('drive.messages.shareError'));
      }
    },
    
    copyShareUrl() {
      const input = document.createElement('input');
      input.value = this.shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      alert(this.$t('drive.messages.urlCopied'));
    },
    
    // 二维码相关
    showQRCode(file) {
      this.currentFile = file;
      const downloadLink = this.getDownloadLink(file.name);
      this.showQR = true;
      this.$nextTick(() => {
        QRCode.toCanvas(document.getElementById('qrcode'), downloadLink, (error) => {
          if (error) console.error(error);
          console.log('QR码生成成功');
        });
      });
    },
    
    hideQRCode() {
      this.showQR = false;
      this.currentFile = null;
    },
    
    // 辅助方法
    formatFileSize(size) {
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let i = 0;
      while (size >= 1024 && i < units.length - 1) {
        size /= 1024;
        i++;
      }
      return `${size.toFixed(2)} ${units[i]}`;
    },
    
    formatDate(dateString) {
      const date = new Date(dateString);
      return date.toLocaleString(this.selectedLanguage);
    },
    
    getDownloadLink(fileName) {
      return `https://fastdrive.myfastools.com/${encodeURIComponent(fileName)}`;
    },
    
    downloadFile(file) {
      window.open(this.getDownloadLink(file.name), '_blank');
    }
  },
  
  // 生命周期钩子
  mounted() {
    // 初始化
    this.changeLanguage().then(() => {
      // 语言加载完成后立即加载文件列表
      this.fetchFiles();
    });
  }
}); 