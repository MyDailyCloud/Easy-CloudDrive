document.addEventListener('DOMContentLoaded', () => {
    // Helper function to load language data (remains global or move inside Vue if preferred)
    async function loadLanguage(lang) {
      try {
        const response = await fetch(`/i18n.json`); // Assumes i18n.json is in public root
        if (!response.ok) {
          throw new Error('无法加载语言文件');
        }
        const data = await response.json();
        console.log(`Loaded language data for ${lang}:`, data[lang] || data['zh']);
        return data[lang] || data['zh'];
      } catch (error) {
        console.error('加载语言文件时出错:', error);
        return null; // Return null on error
      }
    }

    const driveApp = new Vue({
      el: '#app',
      // --- Data ---
      data: {
        files: [], // Holds current directory file list
        isLoading: false, // Loading indicator for file list
        showQR: false, // QR code modal visibility
        currentFile: null, // For QR code/preview modal title/info
        selectedFile: null, // For direct file upload input
        uploadProgress: 0, // Upload progress percentage
        urlToUpload: '', // Input for URL upload
        uploadFileName: '', // User override for direct upload filename
        urlUploadFileName: '', // User override for URL upload filename
        selectedLanguage: 'zh', // Default language
        i18n: null, // Holds loaded language data
        currentPath: '', // Current folder path, e.g., "folder1/subfolder/" or "" for root
        searchQuery: '', // Search input model
        searchResults: [], // Holds search results
        isSearchMode: false, // Flag if currently showing search results
        showCreateFolderModal: false, // Create folder modal visibility
        newFolderName: '', // Input for new folder name
        pageSize: 50, // How many files to fetch per page (adjust as needed)
        currentCursor: null, // For R2 list pagination
        hasMoreFiles: false, // Flag if more files are available via pagination
        showRenameModal: false, // Rename modal visibility
        renameFileTarget: null, // Store the file object being renamed
        renameNewName: '', // Input for new name in rename modal
        showShareModal: false, // Share modal visibility
        shareFilePath: '', // Full path of the file being shared
        shareExpirationDays: 7, // Default share expiration
        shareRequirePassword: false, // Share password requirement flag
        sharePassword: '', // Input for share password
        shareUrl: '', // Holds the generated share URL
        showShareResult: false, // Toggles share modal sections (settings vs result)
        showPreview: false, // Preview modal visibility
        previewFileTarget: null, // Info of the file being previewed
        previewType: '', // 'image', 'pdf', 'text', 'video', 'audio'
        previewContent: '', // URL or text content for preview
        isPartialContent: false, // Flag if preview content is truncated
        authToken: localStorage.getItem('authToken') || '', // Load token on init (use empty string as default)
      },
      // --- Computed ---
      computed: {
        // Calculates breadcrumb segments from the current path
        pathSegments() {
          if (!this.currentPath) { return []; }
          // Ensure path ends with '/' for consistency if not root
          const consistentPath = this.currentPath.endsWith('/') ? this.currentPath : this.currentPath + '/';
          const path = consistentPath.slice(0, -1); // Remove trailing slash for splitting
          if (!path) return [];

          const segments = path.split('/');
          const result = [];
          let cumulativePath = '';
          for (let i = 0; i < segments.length; i++) {
              if (!segments[i]) continue;
              cumulativePath += segments[i] + '/';
              result.push({
                  name: segments[i],
                  path: cumulativePath
              });
          }
          return result;
        },
        // Determines which list of files to display (search results or current folder)
        displayedFiles() {
          return this.isSearchMode ? this.searchResults : this.files;
        }
      },
      // --- Methods ---
      methods: {
        // --- I18n ---
        $t(key, params = {}) {
            if (!this.i18n) return key;
            const keys = key.split('.');
            let value = this.i18n;
            for (const k of keys) {
                if (value === undefined || value === null || !value.hasOwnProperty(k)) {
                    return key;
                }
                value = value[k];
            }
            if (typeof value === 'string') {
                return value.replace(/\{\{(\w+)\}\}/g, (_, paramName) => {
                    return params[paramName] !== undefined ? params[paramName] : `{{${paramName}}}`;
                });
            }
            return value !== undefined ? value : key;
        },
        async changeLanguage() {
            console.log(`Changing language to: ${this.selectedLanguage}`);
            this.i18n = await loadLanguage(this.selectedLanguage);
            if (this.i18n) {
                 console.log("i18n data loaded for Vue.");
                 // No need to manually update static elements if they use {{ $t(...) }}
                 this.$forceUpdate(); // Ensure reactivity updates
            } else {
                 console.error("Failed to load language data for Vue.");
            }
        },

        // --- API Calls & File Operations ---
        getAuthHeaders(contentType = 'application/json', needsContent = true) {
            const headers = {};
            if (needsContent && contentType) { // Only add Content-Type if needed and provided
                 headers['Content-Type'] = contentType;
            }
            if (this.authToken) {
                headers['Authorization'] = `Bearer ${this.authToken}`;
            } else {
                console.warn("Auth token missing for API call.");
            }
            return headers;
        },

        async fetchFiles(path = this.currentPath, loadMore = false) {
            if (!loadMore) {
                this.isLoading = true;
                this.currentCursor = null; // Reset cursor when navigating/refreshing
                this.files = []; // Clear files unless loading more
            }
            console.log(`Fetching files for path: '${path}', cursor: ${this.currentCursor}, loadMore: ${loadMore}, searchMode: ${this.isSearchMode}`);
            const headers = this.getAuthHeaders(null, false); // No content-type needed for GET

            try {
                const endpoint = this.isSearchMode ? '/searchFiles' : '/getfilelist';
                const params = new URLSearchParams();

                if (this.isSearchMode) {
                    params.append('query', this.searchQuery);
                    if (path) params.append('path', path); // Search within specific path
                } else {
                    if (path) params.append('path', path);
                    params.append('pageSize', this.pageSize);
                    if (loadMore && this.currentCursor) {
                        params.append('cursor', this.currentCursor);
                    }
                }
                const url = `${endpoint}${params.toString() ? '?' + params.toString() : ''}`;
                console.log("Fetching URL:", url);

                const response = await fetch(url, { headers });

                if (!response.ok) {
                    const errorText = await response.text();
                    let serverMessage = errorText;
                    try { serverMessage = JSON.parse(errorText).message || errorText; } catch(e){}
                    throw new Error(`${this.$t('drive.messages.fetchError')} (${response.status}: ${serverMessage})`);
                }
                const data = await response.json();
                console.log("Fetched data:", data);

                if (this.isSearchMode) {
                    this.searchResults = (data.results || []).map(file => ({
                        ...file,
                        // Ensure consistent properties for display
                        relativeName: file.fileName,
                        type: 'file' // Assume search returns only files
                    }));
                    // Search doesn't typically support pagination in this setup
                    this.hasMoreFiles = false;
                    this.currentCursor = null;
                } else {
                    const processedFiles = (data.files || []).map(file => ({
                        ...file,
                        // Calculate relative name if listing a subfolder
                        relativeName: path ? file.name.substring(path.length) : file.name
                    }));

                    if (loadMore) {
                        // Append new files, prevent duplicates just in case
                        const existingNames = new Set(this.files.map(f => f.name));
                        const uniqueNewFiles = processedFiles.filter(f => !existingNames.has(f.name));
                        this.files = [...this.files, ...uniqueNewFiles];
                    } else {
                        this.files = processedFiles;
                    }
                    this.currentCursor = data.cursor;
                    this.hasMoreFiles = data.hasMore;
                }
                this.currentPath = path; // Update current path state

            } catch (error) {
                console.error('获取文件列表出错:', error);
                alert(error.message);
                // Reset state on error
                this.files = [];
                this.searchResults = [];
                this.hasMoreFiles = false;
                this.currentCursor = null;
            } finally {
                 if (!loadMore) this.isLoading = false;
            }
        },

        async loadMoreFiles() {
             if (!this.hasMoreFiles || this.isSearchMode || !this.currentCursor || this.isLoading) return;
             await this.fetchFiles(this.currentPath, true);
        },

        navigateToFolder(file) {
            if (file.type !== 'folder') return;
            console.log("Navigating to folder:", file.name);
            this.isSearchMode = false;
            this.searchQuery = '';
            this.fetchFiles(file.name); // Pass the full path of the folder
        },

        navigateToBreadcrumb(segment) {
            console.log("Navigating via breadcrumb to:", segment.path);
            this.isSearchMode = false;
            this.searchQuery = '';
            this.fetchFiles(segment.path);
        },

        async searchFilesAction() { // Renamed from searchFiles to avoid conflict with Vue internals?
            if (!this.searchQuery.trim()) {
                this.clearSearch();
                return;
            }
            console.log("Searching for:", this.searchQuery, "in path:", this.currentPath);
            this.isSearchMode = true;
            await this.fetchFiles(this.currentPath); // Fetch results for current path
        },

        clearSearch() {
            console.log("Clearing search");
            this.searchQuery = '';
            this.isSearchMode = false;
            this.searchResults = [];
            this.fetchFiles(this.currentPath); // Re-fetch files for the current folder
        },

        openCreateFolderModal() {
            this.newFolderName = '';
            this.showCreateFolderModal = true;
            this.$nextTick(() => {
                // Assuming the input has ref="newFolderNameInput" in HTML
                if (this.$refs.newFolderNameInput) this.$refs.newFolderNameInput.focus();
            });
        },
        closeCreateFolderModal() {
             this.showCreateFolderModal = false;
        },

        async createFolder() {
            const folderName = this.newFolderName.trim();
            if (!folderName || folderName.includes('/')) {
                alert(this.$t('drive.messages.enterValidFolderName'));
                return;
            }
            const folderPath = this.currentPath + folderName + '/'; // Folders need trailing slash
            console.log("Creating folder:", folderPath);
            const headers = this.getAuthHeaders(); // Default Content-Type: application/json

            try {
                const response = await fetch('/createFolder', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({ folderPath })
                });
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.message || this.$t('drive.messages.folderCreateError'));
                }
                alert(this.$t('drive.messages.folderCreateSuccess'));
                this.closeCreateFolderModal();
                this.fetchFiles(this.currentPath); // Refresh
            } catch (error) {
                console.error('创建文件夹失败:', error);
                alert(`${this.$t('drive.messages.folderCreateError')}: ${error.message}`);
            }
        },

        openRenameModal(file) {
            console.log("Opening rename modal for:", file);
            this.renameFileTarget = file;
            this.renameNewName = this.getFileName(file); // Use helper to get relative name
            this.showRenameModal = true;
            this.$nextTick(() => {
                 // Assuming input has ref="renameInput"
                 if(this.$refs.renameInput) this.$refs.renameInput.focus();
            });
        },
        closeRenameModal() {
            this.showRenameModal = false;
            this.renameFileTarget = null;
            this.renameNewName = '';
        },

        async renameFileAction() { // Renamed to avoid conflict
            const newName = this.renameNewName.trim();
            if (!newName || newName.includes('/')) {
                alert(this.$t('drive.messages.enterValidFileName'));
                return;
            }
            if (!this.renameFileTarget) return;

            const oldFullName = this.renameFileTarget.name;
            let newFullName;
            const pathPrefix = this.currentPath;

            if (this.renameFileTarget.type === 'folder') {
                newFullName = pathPrefix + newName + '/'; // Add trailing slash for folders
            } else {
                newFullName = pathPrefix + newName;
            }

            if (oldFullName === newFullName) {
                this.closeRenameModal();
                return; // No change needed
            }

            console.log(`Renaming '${oldFullName}' to '${newFullName}'`);
            const headers = this.getAuthHeaders();

            try {
                const response = await fetch('/renameFile', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({ oldFileName: oldFullName, newFileName: newFullName })
                });
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.message || this.$t('drive.messages.renameError'));
                }
                alert(this.$t('drive.messages.renameSuccess'));
                this.closeRenameModal();
                this.fetchFiles(this.currentPath); // Refresh list
            } catch (error) {
                console.error('重命名失败:', error);
                alert(`${this.$t('drive.messages.renameError')}: ${error.message}`);
            }
        },

        async deleteFileAction(file) { // Renamed
            const confirmMessage = file.type === 'folder'
                ? this.$t('drive.messages.confirmDeleteFolder', { name: this.getFileName(file) })
                : this.$t('drive.messages.confirmDelete', { name: this.getFileName(file) });

            if (!confirm(confirmMessage)) return;

            console.log("Deleting:", file.name);
            const headers = this.getAuthHeaders(null, false); // No content-type for DELETE

            try {
                const response = await fetch(`/deleteFile?path=${encodeURIComponent(file.name)}`, {
                    method: 'DELETE',
                    headers: headers
                });
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.message || this.$t('drive.messages.deleteError'));
                }
                alert(this.$t('drive.messages.deleteSuccess'));
                this.fetchFiles(this.currentPath); // Refresh list
            } catch (error) {
                console.error('删除失败:', error);
                alert(`${this.$t('drive.messages.deleteError')}: ${error.message}`);
            }
        },

        handleFileUpload(event) {
            const file = event.target.files[0];
            if (file) {
                this.selectedFile = file;
                this.uploadFileName = ''; // Reset user override on new selection
                console.log("File selected:", this.selectedFile);
            } else {
                this.selectedFile = null;
            }
        },

        async uploadFileAction() { // Renamed
            if (!this.selectedFile) {
                alert(this.$t('drive.messages.selectFile'));
                return;
            }

            const finalFileName = (this.uploadFileName || this.selectedFile.name).trim();
            if (!finalFileName || finalFileName.includes('/')) {
                 alert(this.$t('drive.messages.enterValidFileName'));
                 return;
            }

            const fullPath = this.currentPath + finalFileName;
            console.log(`Uploading file to: ${fullPath}`);
            const fileSize = this.selectedFile.size;
            // Simple threshold for MPU, adjust as needed. 5GB is R2 PUT limit.
            const useMPU = fileSize > 100 * 1024 * 1024; // 100MB threshold

            if (useMPU) {
                await this.uploadFileWithMPU(finalFileName, fileSize);
            } else {
                await this.uploadFileDirectly(finalFileName);
            }
        },

        async uploadFileDirectly(fileName) {
            // Reverted to XMLHttpRequest POST to /upload for direct uploads and progress
            console.log("Uploading directly (POST to /upload)...");
            this.uploadProgress = 1; // Indicate start

            const formData = new FormData();
            formData.append('file', this.selectedFile);
            formData.append('path', this.currentPath); // Server needs path prefix
            formData.append('fileName', fileName); // Send relative file name

            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/upload', true); // Use POST to /upload endpoint

            // Apply Auth Header
            const headers = this.getAuthHeaders(null, false); // No Content-Type for FormData
            if (headers['Authorization']) {
                xhr.setRequestHeader('Authorization', headers['Authorization']);
            }

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    this.uploadProgress = Math.round((event.loaded / event.total) * 100);
                }
            };

            xhr.onload = async () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    console.log("Direct upload successful:", xhr.responseText);
                    // Response might contain file details, parse if needed
                    try {
                        // const responseData = JSON.parse(xhr.responseText);
                        // console.log("Upload response data:", responseData);
                    } catch (e) {
                        console.warn("Could not parse upload response JSON:", xhr.responseText);
                    }
                    alert(this.$t('drive.messages.uploadSuccess'));
                    this.resetUploadState();
                    await this.fetchFiles(this.currentPath); // Refresh list
                } else {
                    let errorMsg = xhr.responseText;
                    try {
                        // Try parsing backend error message
                        errorMsg = JSON.parse(xhr.responseText).message || xhr.responseText;
                    } catch (e) {}
                     console.error(`Direct upload failed: ${xhr.status} ${errorMsg}`);
                     alert(`${this.$t('drive.messages.uploadError')} (${xhr.status}): ${errorMsg}`);
                     this.uploadProgress = 0; // Reset progress on error
                }
            };

            xhr.onerror = () => {
                 console.error('Direct upload network error.');
                 alert(this.$t('drive.messages.networkError'));
                 this.uploadProgress = 0; // Reset progress on error
            };

            xhr.send(formData);
        },

        async uploadFileWithMPU(finalFileName, fileSize) {
            console.log("Starting MPU upload...");
            const chunkSize = 10 * 1024 * 1024; // 10MB parts
            const totalChunks = Math.ceil(fileSize / chunkSize);
            this.uploadProgress = 0;
            const baseHeaders = this.getAuthHeaders(); // Get headers with token
            let uploadId = null;

            try {
                // --- 1. Create MPU ---
                console.log("Creating MPU...");
                const createResponse = await fetch(`/uploadfile?action=mpu-create`, {
                    method: 'POST',
                    headers: { ...baseHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fileName: finalFileName, path: this.currentPath })
                });
                if (!createResponse.ok) throw new Error(`MPU Create failed: ${createResponse.status} ${await createResponse.text()}`);
                const createData = await createResponse.json();
                uploadId = createData.uploadId;
                if(!uploadId) throw new Error("MPU Create response missing uploadId");
                console.log("MPU Created, Upload ID:", uploadId);

                // --- 2. Upload Parts ---
                const uploadedParts = [];
                for (let i = 0; i < totalChunks; i++) {
                    const partNumber = i + 1;
                    const start = i * chunkSize;
                    const end = Math.min(start + chunkSize, fileSize);
                    const chunk = this.selectedFile.slice(start, end);
                    console.log(`Uploading part ${partNumber}/${totalChunks}, size: ${chunk.size}`);

                    const partHeaders = this.getAuthHeaders(null, false); // No content type for part PUT
                    const partUploadUrl = `/uploadfile?action=mpu-uploadpart&uploadId=${uploadId}&partNumber=${partNumber}&path=${encodeURIComponent(this.currentPath)}&fileName=${encodeURIComponent(finalFileName)}`;

                    const partResponse = await fetch(partUploadUrl, { method: 'PUT', headers: partHeaders, body: chunk });

                    if (!partResponse.ok) throw new Error(`MPU Part ${partNumber} upload failed: ${partResponse.status} ${await partResponse.text()}`);
                    const partData = await partResponse.json();
                    if (!partData.etag) throw new Error(`MPU Part ${partNumber} response missing ETag`);

                    uploadedParts.push({ partNumber: partNumber, etag: partData.etag });
                    console.log(`Part ${partNumber} uploaded, ETag: ${partData.etag}`);
                    this.uploadProgress = Math.round(partNumber / totalChunks * 95); // Cap at 95% until complete
                }
                console.log("All parts uploaded:", uploadedParts);

                // --- 3. Complete MPU ---
                console.log("Completing MPU...");
                const completeUrl = `/uploadfile?action=mpu-complete&uploadId=${uploadId}&path=${encodeURIComponent(this.currentPath)}&fileName=${encodeURIComponent(finalFileName)}`;
                const completeResponse = await fetch(completeUrl, {
                    method: 'POST',
                    headers: { ...baseHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ parts: uploadedParts })
                });

                if (!completeResponse.ok) {
                    throw new Error(`${this.$t('drive.messages.uploadError')} (Complete failed: ${completeResponse.status} ${await completeResponse.text()})`);
                }

                console.log("MPU Completed successfully.");
                this.uploadProgress = 100;
                alert(this.$t('drive.messages.uploadSuccess'));
                this.resetUploadState();
                this.fetchFiles(this.currentPath);

            } catch (error) {
                console.error('MPU Upload Error:', error);
                alert(`${this.$t('drive.messages.uploadError')}: ${error.message}`);
                this.uploadProgress = 0; // Reset progress on error

                if (uploadId) { // Attempt to abort if MPU started
                    console.log("Attempting to abort MPU due to error...");
                    const abortUrl = `/uploadfile?action=mpu-abort&uploadId=${uploadId}&path=${encodeURIComponent(this.currentPath)}&fileName=${encodeURIComponent(finalFileName)}`;
                    try {
                        const abortHeaders = this.getAuthHeaders(null, false);
                        await fetch(abortUrl, { method: 'DELETE', headers: abortHeaders });
                        console.log("Abort request sent for uploadId:", uploadId);
                    } catch (abortError) {
                        console.error("Failed to send abort request:", abortError);
                    }
                }
            }
        },

        resetUploadState() {
            this.selectedFile = null;
            this.uploadFileName = '';
            this.uploadProgress = 0;
            // Assuming input has ref="fileInput"
            if (this.$refs.fileInput) this.$refs.fileInput.value = null;
        },

        async uploadFileByUrlAction() { // Renamed
            const url = this.urlToUpload.trim();
            const fileName = this.urlUploadFileName.trim();

            if (!url || !this.isValidHttpUrl(url)) {
                alert(this.$t('drive.messages.enterValidUrl'));
                return;
            }
            if (!fileName || fileName.includes('/')) {
                alert(this.$t('drive.messages.enterValidFileName'));
                return;
            }

            const fullPath = this.currentPath + fileName;
            console.log(`Uploading from URL: ${url} to ${fullPath}`);
            const headers = this.getAuthHeaders();

            try {
                const response = await fetch('/uploadbyurl', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({ url: url, path: this.currentPath, fileName: fileName })
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    let serverMessage = errorText;
                    try { serverMessage = JSON.parse(errorText).message || errorText; } catch(e){}
                    throw new Error(`${this.$t('drive.messages.urlUploadError')} (${response.status}: ${serverMessage})`);
                }
                alert(this.$t('drive.messages.urlUploadSuccess'));
                this.urlToUpload = ''; // Clear inputs
                this.urlUploadFileName = '';
                this.fetchFiles(this.currentPath); // Refresh
            } catch (error) {
                console.error('通过URL上传文件出错:', error);
                alert(error.message);
            }
        },

        async previewFileAction(file) { // Renamed
            if (file.type === 'folder') return;
            console.log("Attempting to preview file:", file);
            const { contentType = '', name: filePath } = file;
            const headers = this.getAuthHeaders(null, false);

            try {
                const isImage = contentType.startsWith('image/');
                const isPdf = contentType === 'application/pdf';
                const isText = contentType.startsWith('text/') || ['application/json', 'application/xml', 'application/javascript', 'application/x-yaml', 'application/toml', 'application/markdown'].includes(contentType);
                const isVideo = contentType.startsWith('video/');
                const isAudio = contentType.startsWith('audio/');

                if (!(isImage || isPdf || isText || isVideo || isAudio)) {
                    alert(this.$t('drive.messages.previewNotSupported', { type: contentType || 'unknown' }));
                    return;
                }

                this.previewFileTarget = file;
                if (isImage) this.previewType = 'image';
                else if (isPdf) this.previewType = 'pdf';
                else if (isText) this.previewType = 'text';
                else if (isVideo) this.previewType = 'video';
                else if (isAudio) this.previewType = 'audio';

                this.previewContent = ''; // Indicate loading
                this.isPartialContent = false;
                this.showPreview = true;

                console.log("Fetching preview content for:", filePath);
                const response = await fetch(`/previewFile?file=${encodeURIComponent(filePath)}`, { headers });

                if (!response.ok) {
                    const errorText = await response.text();
                    let serverMessage = errorText;
                    try { serverMessage = JSON.parse(errorText).message || errorText; } catch(e){}
                    throw new Error(`${this.$t('drive.messages.previewError')} (${response.status}: ${serverMessage})`);
                }

                this.isPartialContent = response.headers.get('X-Partial-Content') === 'true';
                const responseContentType = response.headers.get('Content-Type');

                if (this.previewType === 'text') {
                    this.previewContent = await response.text();
                } else {
                    const blob = await response.blob();
                    // Use actual response type if available, fallback to original listing type
                    this.previewContent = URL.createObjectURL(new Blob([blob], { type: responseContentType || contentType }));
                }
                console.log(`${this.previewType} preview loaded. Partial: ${this.isPartialContent}`);

            } catch (error) {
                console.error('预览文件失败:', error);
                alert(error.message);
                this.closePreview(); // Close modal on error
            }
        },

        closePreview() {
            this.showPreview = false;
            // Revoke blob URL if it exists
            if (this.previewContent && typeof this.previewContent === 'string' && this.previewContent.startsWith('blob:')) {
                URL.revokeObjectURL(this.previewContent);
                console.log("Revoked object URL:", this.previewContent);
            }
            this.previewContent = '';
            this.previewFileTarget = null;
            this.previewType = '';
            this.isPartialContent = false;
        },

        openShareModal(file) {
            if (file.type === 'folder') {
                alert(this.$t('drive.messages.folderShareNotSupported'));
                return;
            }
            console.log("Opening share modal for:", file.name);
            this.shareFilePath = file.name;
            this.shareExpirationDays = 7;
            this.shareRequirePassword = false;
            this.sharePassword = '';
            this.showShareResult = false;
            this.shareUrl = '';
            this.showShareModal = true;
        },
        closeShareModal() {
             this.showShareModal = false;
        },

        async shareFileAction() { // Renamed
            console.log(`Sharing file: ${this.shareFilePath}, expires: ${this.shareExpirationDays} days, password required: ${this.shareRequirePassword}`);
            const headers = this.getAuthHeaders();

            try {
                const response = await fetch('/shareFile', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        filePath: this.shareFilePath,
                        expirationDays: parseInt(this.shareExpirationDays),
                        requirePassword: this.shareRequirePassword,
                        password: this.shareRequirePassword ? this.sharePassword : undefined
                    })
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    let serverMessage = errorText;
                    try { serverMessage = JSON.parse(errorText).message || errorText; } catch(e){}
                    throw new Error(`${this.$t('drive.messages.shareError')} (${response.status}: ${serverMessage})`);
                }
                const result = await response.json();
                if (!result.shareUrl) {
                    throw new Error("Share response missing shareUrl");
                }
                this.shareUrl = result.shareUrl;
                this.showShareResult = true; // Show result section
                console.log("Share URL created:", this.shareUrl);
            } catch (error) {
                console.error('分享文件失败:', error);
                alert(error.message);
            }
        },

        copyShareUrl() {
            if (!this.shareUrl) return;
            navigator.clipboard.writeText(this.shareUrl).then(() => {
                alert(this.$t('drive.messages.urlCopied'));
            }).catch(err => {
                console.error('无法复制分享链接:', err);
                alert(this.$t('drive.messages.copyUrlError'));
            });
        },

        showQRCodeAction(file) { // Renamed
            if (file.type === 'folder') return;
            this.currentFile = file; // For modal title
            const downloadLink = this.getDirectDownloadLink(file.name);
            if (!downloadLink) {
                alert(this.$t('drive.messages.qrCodeError'));
                return;
            }
            console.log("Generating QR Code for:", downloadLink);
            this.showQR = true;
            this.$nextTick(() => {
                const qrElement = document.getElementById('qrcode'); // Assumes element with id="qrcode" exists
                if (!qrElement) { console.error("QR Code element not found"); return; }
                qrElement.innerHTML = ''; // Clear previous
                try {
                    QRCode.toCanvas(qrElement, downloadLink, { width: 200, margin: 2 }, (error) => {
                        if (error) {
                             console.error("QR Code generation failed:", error);
                             qrElement.innerHTML = `<span class="text-red-500 text-xs">${this.$t('drive.messages.qrCodeError')}</span>`;
                        } else {
                           console.log('QR码生成成功');
                        }
                    });
                } catch (error) {
                    console.error("QR Code library error:", error);
                    qrElement.innerHTML = `<span class="text-red-500 text-xs">${this.$t('drive.messages.qrCodeError')}</span>`;
                }
            });
        },
        hideQRCode() {
            this.showQR = false;
            this.currentFile = null;
            const qrElement = document.getElementById('qrcode');
            if (qrElement) qrElement.innerHTML = ''; // Clear canvas
        },

        // --- Helpers ---
        formatFileSize(size) {
            if (typeof size !== 'number' || size < 0) return '-';
            if (size === 0) return '0 B';
            const units = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(size) / Math.log(1024));
            const unitIndex = Math.min(i, units.length - 1);
            return `${(size / Math.pow(1024, unitIndex)).toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
        },
        formatDate(dateString) {
            try {
                if (!dateString) return '-';
                const date = new Date(dateString);
                if (isNaN(date.getTime())) return dateString; // Invalid date string
                const locale = ['zh', 'en', 'ko'].includes(this.selectedLanguage) ? this.selectedLanguage : navigator.language || 'default';
                return date.toLocaleString(locale, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            } catch (e) { return dateString; }
        },
        // Helper to get display name (handles search results vs list items)
        getFileName(file) {
            // Use relativeName if available (from list), otherwise fileName (from search)
            return file.relativeName || file.fileName || file.name || '未知名称';
        },
        getDownloadUrl(file) {
             if (file.type === 'folder') return '#'; // Or null/undefined
             return this.getDirectDownloadLink(file.name); // Use the helper
        },
        getDirectDownloadLink(fullPath) {
            // !!! IMPORTANT: This needs to be configured based on your R2 setup !!!
            // Option 1: Public R2 bucket URL (if bucket is public)
            // const r2PublicUrl = 'YOUR_R2_PUBLIC_URL'; // e.g., https://pub-xxxxx.r2.dev
            // return `${r2PublicUrl}/${encodeURIComponent(fullPath)}`;

            // Option 2: Custom domain mapped to R2 via Cloudflare CNAME
             const customDomain = window.location.origin; // Assuming served from the same domain
             // const customDomain = 'https://your-drive-domain.com';
             return `${customDomain}/${encodeURIComponent(fullPath)}`;

            // Option 3: Dedicated download endpoint in your Worker
            // return `/download/${encodeURIComponent(fullPath)}`;

            // Placeholder - using Option 2 with current origin
             // console.warn("Using current origin as download link base. Ensure R2 is mapped correctly.");
             // return `${window.location.origin}/${encodeURIComponent(fullPath)}`;
        },
        isValidHttpUrl(string) {
            if (!string || typeof string !== 'string') return false;
            try {
                const url = new URL(string);
                return url.protocol === 'http:' || url.protocol === 'https:';
            } catch (_) {
                return false;
            }
        }
      },
      // --- Lifecycle Hooks ---
      async mounted() {
        console.log("Vue app mounted");
        // Load language preference or default
        const initialLang = localStorage.getItem('selectedLanguage') || 'zh';
        this.selectedLanguage = initialLang;
        document.documentElement.lang = initialLang; // Set initial html lang

        // Load i18n data FIRST
        await this.changeLanguage(); // This sets this.i18n

        // Fetch initial file list for the root directory AFTER language is loaded
        this.fetchFiles(''); // Fetch root path

        // Add event listener for focusing folder name input when modal opens
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length) {
                    const folderInput = this.$refs.newFolderNameInput;
                    if (folderInput && document.body.contains(folderInput)) {
                        this.$nextTick(() => folderInput.focus());
                    }
                    const renameInput = this.$refs.renameInput;
                    if (renameInput && document.body.contains(renameInput)) {
                        this.$nextTick(() => renameInput.focus());
                    }
                }
            });
        });
        observer.observe(document.getElementById('app'), { childList: true, subtree: true });
      },
      // --- Watchers ---
      watch: {
           selectedLanguage(newLang) {
               this.changeLanguage();
               localStorage.setItem('selectedLanguage', newLang); // Store preference
           },
           authToken(newToken) {
              if (newToken) {
                localStorage.setItem('authToken', newToken);
              } else {
                localStorage.removeItem('authToken'); // Remove if empty/null
              }
           },
       }
    }); // End of new Vue()
}); // End of DOMContentLoaded 