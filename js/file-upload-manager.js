const fileUploadManager = {
  buckets: AppConfig.storage.buckets,
  maxFileSize: AppConfig.storage.maxFileSize,
  allowedTypes: AppConfig.storage.allowedFileTypes,

  async init() {
    // Bucket creation disabled - buckets are pre-configured in Supabase
    // This prevents 400 errors from listBuckets() which requires service role access
    console.log('📦 File upload manager initialized (buckets pre-configured)');
  },

  async ensureBucketsExist() {
    if (!window.supabaseReady) return;

    try {
      const { data: existingBuckets, error: listError } = await supabaseClient.storage.listBuckets();
      
      if (listError) {
        console.warn('Unable to list storage buckets:', listError.message);
        return; // Silently fail - buckets may already exist
      }

      const existingBucketNames = existingBuckets.map(b => b.name);

      for (const bucketName of Object.values(this.buckets)) {
        if (!existingBucketNames.includes(bucketName)) {
          try {
            await supabaseClient.storage.createBucket(bucketName, {
              public: false,
              fileSizeLimit: this.maxFileSize
            });
            console.log(`✅ Created bucket: ${bucketName}`);
          } catch (createError) {
            // Bucket may already exist or user may not have permission
            // This is not critical - log and continue
            console.warn(`⚠️ Could not create bucket '${bucketName}':`, createError.message);
          }
        }
      }
    } catch (error) {
      // Non-critical error - storage buckets may already be set up
      console.warn('⚠️ Storage bucket initialization skipped:', error.message);
    }
  },

  validateFile(file, category = 'documents') {
    const errors = [];

    if (file.size > this.maxFileSize) {
      errors.push(`File size exceeds ${this.maxFileSize / (1024 * 1024)}MB limit`);
    }

    const allowedExtensions = this.allowedTypes[category] || this.allowedTypes.documents;
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!allowedExtensions.includes(fileExtension)) {
      errors.push(`File type ${fileExtension} not allowed. Allowed types: ${allowedExtensions.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  },

  async uploadFile(file, bucket, path, options = {}) {
    if (!window.supabaseReady) {
      throw new Error('Supabase not initialized');
    }

    const validation = this.validateFile(file, options.category);
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }

    const fileName = options.fileName || `${Date.now()}_${file.name}`;
    const filePath = path ? `${path}/${fileName}` : fileName;

    try {
      const { data, error } = await supabaseClient.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: options.upsert || false
        });

      if (error) throw error;

      const publicUrl = this.getPublicUrl(bucket, filePath);

      return {
        success: true,
        path: data.path,
        fullPath: data.fullPath,
        publicUrl,
        fileName,
        fileSize: file.size,
        fileType: file.type
      };
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  },

  async uploadMultipleFiles(files, bucket, path, options = {}) {
    const results = [];
    const errors = [];

    for (const file of files) {
      try {
        const result = await this.uploadFile(file, bucket, path, options);
        results.push(result);
      } catch (error) {
        errors.push({ file: file.name, error: error.message });
      }
    }

    return { results, errors };
  },

  async deleteFile(bucket, path) {
    if (!window.supabaseReady) {
      throw new Error('Supabase not initialized');
    }

    try {
      const { error } = await supabaseClient.storage
        .from(bucket)
        .remove([path]);

      if (error) throw error;

      return { success: true };
    } catch (error) {
      console.error('Delete error:', error);
      throw error;
    }
  },

  async downloadFile(bucket, path) {
    if (!window.supabaseReady) {
      throw new Error('Supabase not initialized');
    }

    try {
      const { data, error } = await supabaseClient.storage
        .from(bucket)
        .download(path);

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Download error:', error);
      throw error;
    }
  },

  getPublicUrl(bucket, path) {
    if (!window.supabaseReady) return null;

    const { data } = supabaseClient.storage
      .from(bucket)
      .getPublicUrl(path);

    return data.publicUrl;
  },

  async listFiles(bucket, path = '') {
    if (!window.supabaseReady) {
      throw new Error('Supabase not initialized');
    }

    try {
      const { data, error } = await supabaseClient.storage
        .from(bucket)
        .list(path);

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('List files error:', error);
      throw error;
    }
  },

  createUploadWidget(options = {}) {
    const {
      bucket,
      path = '',
      category = 'documents',
      multiple = false,
      onSuccess,
      onError,
      buttonText = 'Upload File',
      accept = ''
    } = options;

    const widgetId = 'upload-widget-' + Date.now();
    const acceptAttr = accept || this.allowedTypes[category]?.join(',') || '';

    const widget = document.createElement('div');
    widget.id = widgetId;
    widget.style.cssText = 'display: inline-block;';

    widget.innerHTML = `
      <input 
        type="file" 
        id="${widgetId}-input" 
        ${multiple ? 'multiple' : ''} 
        accept="${acceptAttr}"
        style="display: none;"
      />
      <button 
        type="button"
        class="btn btn-secondary" 
        onclick="document.getElementById('${widgetId}-input').click()"
        style="display: flex; align-items: center; gap: var(--space-2);"
      >
        <span>📎</span>
        <span>${buttonText}</span>
      </button>
      <div id="${widgetId}-progress" style="display: none; margin-top: var(--space-2);">
        <div style="background: var(--bg-tertiary); border-radius: var(--radius-full); height: 8px; overflow: hidden;">
          <div id="${widgetId}-progress-bar" style="background: var(--color-primary); height: 100%; width: 0%; transition: width 0.3s;"></div>
        </div>
        <p id="${widgetId}-status" style="font-size: var(--font-size-xs); color: var(--text-secondary); margin-top: var(--space-1);"></p>
      </div>
      <div id="${widgetId}-files" style="margin-top: var(--space-3);"></div>
    `;

    const input = widget.querySelector(`#${widgetId}-input`);
    const progress = widget.querySelector(`#${widgetId}-progress`);
    const progressBar = widget.querySelector(`#${widgetId}-progress-bar`);
    const status = widget.querySelector(`#${widgetId}-status`);
    const filesContainer = widget.querySelector(`#${widgetId}-files`);

    input.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      progress.style.display = 'block';
      filesContainer.innerHTML = '';

      try {
        const totalFiles = files.length;
        let completed = 0;

        for (const file of files) {
          status.textContent = `Uploading ${file.name}...`;
          
          const result = await this.uploadFile(file, bucket, path, { category });
          
          completed++;
          const percent = (completed / totalFiles) * 100;
          progressBar.style.width = percent + '%';

          filesContainer.innerHTML += `
            <div style="display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2); background: var(--bg-tertiary); border-radius: var(--radius-md); margin-bottom: var(--space-2);">
              <span>✅</span>
              <span style="flex: 1; font-size: var(--font-size-sm);">${file.name}</span>
              <span style="font-size: var(--font-size-xs); color: var(--text-secondary);">${(file.size / 1024).toFixed(1)} KB</span>
            </div>
          `;

          if (onSuccess) onSuccess(result, file);
        }

        status.textContent = `${totalFiles} file${totalFiles > 1 ? 's' : ''} uploaded successfully`;
        
        setTimeout(() => {
          progress.style.display = 'none';
          progressBar.style.width = '0%';
        }, 3000);

      } catch (error) {
        status.textContent = 'Upload failed: ' + error.message;
        status.style.color = 'var(--color-danger)';
        if (onError) onError(error);
      }

      input.value = '';
    });

    return widget;
  },

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    if (window.supabaseReady) {
      fileUploadManager.init();
    }
  });
}
