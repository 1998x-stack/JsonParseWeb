// JSON Parser Application
class JSONParser {
    constructor() {
        this.initializeElements();
        this.bindEvents();
        this.currentViewMode = 'tree'; // Default view mode
        // Attempt to get CSRF token on initialization.
        // This token is crucial for POST requests to Django backend to prevent CSRF attacks.
        this.csrfToken = this.getCSRFToken();
        // Stores the last successfully parsed data object from the backend, used for view switching.
        this.lastBackendParsedData = null;
    }

    /**
     * Initializes DOM elements used by the application.
     * Caches references to frequently accessed elements for performance.
     */
    initializeElements() {
        // Input elements
        this.jsonInput = document.getElementById('jsonInput');
        this.parseBtn = document.getElementById('parseBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.loadSampleBtn = document.getElementById('loadSampleBtn');
        this.fileInput = document.getElementById('fileInput');

        // Output elements
        this.jsonDisplay = document.getElementById('jsonDisplay');
        this.statusDisplay = document.getElementById('statusDisplay');
        this.statusIcon = document.getElementById('statusIcon');
        this.statusText = document.getElementById('statusText');
        this.jsonStats = document.getElementById('jsonStats');

        // View mode buttons
        this.treeViewBtn = document.getElementById('treeViewBtn');
        this.rawViewBtn = document.getElementById('rawViewBtn');
        this.tableViewBtn = document.getElementById('tableViewBtn');

        // Statistics display elements
        this.totalProps = document.getElementById('totalProps');
        this.maxDepth = document.getElementById('maxDepth');
        this.arrayCount = document.getElementById('arrayCount');
        this.objectCount = document.getElementById('objectCount');
    }

    /**
     * Binds event listeners to interactive DOM elements.
     * Defines the actions to be taken upon user interactions.
     */
    bindEvents() {
        // Parse button: Sends the JSON string from textarea to the backend for parsing.
        this.parseBtn.addEventListener('click', () => this.sendJsonStringToBackend());
        // Clear button: Clears all input, output, and status displays.
        this.clearBtn.addEventListener('click', () => this.clearAll());
        // Load Sample button: Fetches sample JSON data from the backend.
        this.loadSampleBtn.addEventListener('click', () => this.fetchSampleDataFromBackend());
        // File input: Triggers file upload process when a file is selected.
        this.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        
        // View mode buttons: Switch the display format of the JSON data (client-side rendering of data).
        this.treeViewBtn.addEventListener('click', () => this.switchViewMode('tree'));
        this.rawViewBtn.addEventListener('click', () => this.switchViewMode('raw'));
        this.tableViewBtn.addEventListener('click', () => this.switchViewMode('table'));

        // Setup drag and drop for file input.
        this.setupDragAndDrop();
    }

    /**
     * Sets up drag and drop functionality for the file input zone.
     * Allows users to drag a JSON file directly onto the designated area.
     */
    setupDragAndDrop() {
        const dropZone = document.querySelector('.border-dashed'); // Target the drop zone element.
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault(); // Prevent default browser behavior for dragover.
            dropZone.classList.add('border-blue-400', 'bg-blue-50'); // Visual feedback for dragover.
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault(); // Prevent default browser behavior for dragleave.
            dropZone.classList.remove('border-blue-400', 'bg-blue-50'); // Revert visual feedback.
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault(); // Prevent default browser behavior for drop.
            dropZone.classList.remove('border-blue-400', 'bg-blue-50'); // Revert visual feedback.
            
            const files = e.dataTransfer.files; // Get the dropped files.
            if (files.length > 0 && files[0].type === 'application/json') {
                // If a valid JSON file is dropped, initiate the upload process.
                this.handleFileUpload({ target: { files: [files[0]] } });
            } else {
                this.showStatus('error', '请拖拽有效的JSON文件'); // Show error for invalid file type.
            }
        });
    }
    
    /**
     * Parses JSON string locally. This is primarily used as a quick pre-check 
     * or for view mode switching if `lastBackendParsedData` is not available.
     * The main parsing action for the "Parse" button is `sendJsonStringToBackend`.
     * @param {string} [input] - Optional JSON string. If not provided, uses `this.jsonInput.value`.
     * @returns {object|null} The parsed JSON object or null if parsing fails or input is empty.
     */
    parseJSON(input) {
        const jsonToParse = input || this.jsonInput.value.trim();
        
        if (!jsonToParse) {
            this.showStatus('error', '请输入JSON数据');
            return null;
        }

        try {
            const parsedData = JSON.parse(jsonToParse);
            // This method is mostly for client-side convenience (e.g., view switching fallback).
            // For primary parsing, backend response is used.
            // If called for display purposes, it might redisplay and update stats locally.
            // this.displayJSON(parsedData); 
            // this.updateStats(this.analyzeJSON(parsedData)); // Use client-side analysis for this local parse.
            // this.jsonStats.classList.remove('hidden');
            return parsedData;
        } catch (error) {
            this.showStatus('error', `本地JSON解析错误: ${error.message}`);
            this.jsonDisplay.innerHTML = `
                <div class="text-red-600 p-4">
                    <h3 class="font-bold mb-2">解析错误</h3>
                    <p class="mb-2">${error.message}</p>
                    <div class="text-sm text-gray-600">
                        <p>常见错误原因：</p>
                        <ul class="list-disc list-inside mt-1">
                            <li>缺少引号或逗号</li>
                            <li>多余的逗号</li>
                            <li>使用单引号而非双引号</li>
                            <li>未转义的特殊字符</li>
                        </ul>
                    </div>
                </div>
            `;
            this.jsonStats.classList.add('hidden');
            return null;
        }
    }


    /**
     * Displays the JSON data in the chosen view mode (tree, raw, table).
     * This function is called after successfully receiving data from the backend or local parsing.
     * @param {object} data - The JSON object or array to display.
     */
    displayJSON(data) {
        this.jsonDisplay.innerHTML = ''; // Clear previous content.
        try {
            switch (this.currentViewMode) {
                case 'tree':
                    this.jsonDisplay.innerHTML = this.createTreeView(data);
                    this.bindTreeEvents(); // Bind events for collapsible tree nodes.
                    break;
                case 'raw':
                    // Display formatted raw JSON string.
                    this.jsonDisplay.innerHTML = `<pre class="text-sm p-2">${JSON.stringify(data, null, 2)}</pre>`;
                    break;
                case 'table':
                    this.jsonDisplay.innerHTML = this.createTableView(data);
                    break;
            }
        } catch (error) {
            console.error("Error displaying JSON:", error);
            this.showStatus('error', `渲染JSON时出错: ${error.message}`);
            this.jsonDisplay.innerHTML = `<div class="text-red-500 p-4">渲染JSON时出错: ${error.message}</div>`;
        }
    }

    /**
     * Recursively creates the HTML structure for the tree view.
     * Handles different JSON data types (null, string, number, boolean, array, object).
     * @param {*} data - The JSON data piece to render.
     * @param {number} [depth=0] - Current nesting depth, used for indentation.
     * @returns {string} HTML string representing the tree node.
     */
    createTreeView(data, depth = 0) {
        if (data === null) {
            return '<span class="json-null">null</span>';
        }
        if (typeof data === 'string') {
            return `<span class="json-string">"${this.escapeHtml(data)}"</span>`;
        }
        if (typeof data === 'number') {
            return `<span class="json-number">${data}</span>`;
        }
        if (typeof data === 'boolean') {
            return `<span class="json-boolean">${data}</span>`;
        }
        if (Array.isArray(data)) {
            if (data.length === 0) return '<span class="json-bracket">[]</span>';
            let html = '<div class="json-array">';
            html += '<span class="json-bracket collapsible" data-toggle="array"><span class="expand-icon">▼</span>[</span>';
            html += '<div class="json-content json-indent">';
            data.forEach((item, index) => {
                html += `<div class="json-item">${this.createTreeView(item, depth + 1)}`;
                if (index < data.length - 1) html += '<span class="json-bracket">,</span>';
                html += '</div>';
            });
            html += '</div><span class="json-bracket">]</span></div>';
            return html;
        }
        if (typeof data === 'object') {
            const keys = Object.keys(data);
            if (keys.length === 0) return '<span class="json-bracket">{}</span>';
            let html = '<div class="json-object">';
            html += '<span class="json-bracket collapsible" data-toggle="object"><span class="expand-icon">▼</span>{</span>';
            html += '<div class="json-content json-indent">';
            keys.forEach((key, index) => {
                html += '<div class="json-property">';
                html += `<span class="json-key">"${this.escapeHtml(key)}"</span><span class="json-bracket">: </span>`;
                html += this.createTreeView(data[key], depth + 1);
                if (index < keys.length - 1) html += '<span class="json-bracket">,</span>';
                html += '</div>';
            });
            html += '</div><span class="json-bracket">}</span></div>';
            return html;
        }
        return String(data); // Fallback for other types.
    }

    /**
     * Creates the HTML structure for the table view.
     * Best suited for an array of flat objects. Falls back to a message if data is not suitable.
     * @param {*} data - The JSON data (expected to be an array of objects).
     * @returns {string} HTML string representing the table or a fallback message.
     */
    createTableView(data) {
        if (Array.isArray(data) && data.length > 0 && data.every(item => typeof item === 'object' && item !== null)) {
            // Dynamically determine all unique keys from all objects in the array for table headers
            const allKeys = new Set();
            data.forEach(obj => Object.keys(obj).forEach(key => allKeys.add(key)));
            const keys = Array.from(allKeys);

            if (keys.length === 0 && data.every(item => typeof item !== 'object' || item === null)) {
                 // If data is an array of primitives, display them in a single column table
                 let html = '<div class="overflow-x-auto"><table class="min-w-full border-collapse border border-gray-300">';
                 html += '<thead class="bg-gray-50"><tr><th class="border border-gray-300 px-4 py-2 text-left font-medium">Value</th></tr></thead>';
                 html += '<tbody>';
                 data.forEach((item, index) => {
                     html += `<tr class="${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">`;
                     html += `<td class="border border-gray-300 px-4 py-2">${this.escapeHtml(String(item))}</td>`;
                     html += '</tr>';
                 });
                 html += '</tbody></table></div>';
                 return html;
            }
             if (keys.length === 0 && data.length > 0) { // Array of empty objects or similar
                return '<div class="text-gray-600 text-center p-8">数据为对象数组，但对象内无属性可供展示为表格。</div>';
            }


            let html = '<div class="overflow-x-auto">';
            html += '<table class="min-w-full border-collapse border border-gray-300">';
            html += '<thead class="bg-gray-50"><tr>';
            keys.forEach(key => {
                html += `<th class="border border-gray-300 px-4 py-2 text-left font-medium">${this.escapeHtml(key)}</th>`;
            });
            html += '</tr></thead>';
            html += '<tbody>';
            data.forEach((row, index) => {
                html += `<tr class="${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">`;
                keys.forEach(key => {
                    const value = row[key]; // Access value, will be undefined if key doesn't exist for this row
                    html += '<td class="border border-gray-300 px-4 py-2">';
                    if (typeof value === 'object' && value !== null) {
                        html += `<code class="text-xs">${this.escapeHtml(JSON.stringify(value))}</code>`;
                    } else {
                        html += this.escapeHtml(String(value === undefined ? '' : value)); // Handle undefined values gracefully
                    }
                    html += '</td>';
                });
                html += '</tr>';
            });
            html += '</tbody></table></div>';
            return html;
        } else {
            return '<div class="text-gray-600 text-center p-8">表格视图最适合展示对象数组。当前数据格式不适用。</div>';
        }
    }

    /**
     * Binds click events to collapsible elements in the tree view.
     * Allows users to expand and collapse nodes in the JSON tree.
     */
    bindTreeEvents() {
        const collapsibles = this.jsonDisplay.querySelectorAll('.collapsible');
        collapsibles.forEach(element => {
            element.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent event bubbling.
                const content = element.parentElement.querySelector('.json-content');
                const icon = element.querySelector('.expand-icon');
                
                if (content.classList.contains('collapsed')) {
                    content.classList.remove('collapsed');
                    icon.classList.remove('collapsed'); // Also manage icon's collapsed state for styling if needed
                    icon.textContent = '▼'; // Down arrow for expanded.
                } else {
                    content.classList.add('collapsed');
                    icon.classList.add('collapsed');
                    icon.textContent = '▶'; // Right arrow for collapsed.
                }
            });
        });
    }

    /**
     * Switches the display mode (tree, raw, table) for the JSON data.
     * Re-renders the currently stored backend data (`this.lastBackendParsedData`) in the new view.
     * @param {string} mode - The desired view mode ('tree', 'raw', or 'table').
     */
    switchViewMode(mode) {
        this.currentViewMode = mode;
        
        // Update active state of view mode buttons
        [this.treeViewBtn, this.rawViewBtn, this.tableViewBtn].forEach(btn => {
            btn.classList.remove('bg-blue-600', 'text-white');
            btn.classList.add('bg-gray-200', 'text-gray-700');
        });
        const activeBtn = { tree: this.treeViewBtn, raw: this.rawViewBtn, table: this.tableViewBtn }[mode];
        if (activeBtn) {
            activeBtn.classList.remove('bg-gray-200', 'text-gray-700');
            activeBtn.classList.add('bg-blue-600', 'text-white');
        }
        
        // Re-render JSON if data is available from a previous backend operation.
        if (this.lastBackendParsedData) {
            this.displayJSON(this.lastBackendParsedData);
        } else {
            // If no backend data, try to parse and display current input (if any)
            // This is a fallback and might not always be desired if input is invalid.
            const currentInput = this.jsonInput.value.trim();
            if (currentInput) {
                try {
                    const parsedData = JSON.parse(currentInput);
                    this.displayJSON(parsedData);
                } catch (error) {
                    // Don't show error, just don't re-render if input is invalid during view switch.
                    // Or, clear display:
                    // this.jsonDisplay.innerHTML = '<div class="text-gray-400 p-4">输入内容无效，无法切换视图。</div>';
                }
            }
        }
    }

    /**
     * Shows a status message (success, error, info) to the user.
     * @param {string} type - Type of status ('success', 'error', 'info').
     * @param {string} message - The message to display.
     */
    showStatus(type, message) {
        this.statusDisplay.classList.remove('hidden');
        this.statusDisplay.className = `mb-4 p-3 rounded-lg flex items-center shadow ${
            type === 'success' ? 'bg-green-100 text-green-800' :
            type === 'error' ? 'bg-red-100 text-red-800' :
            'bg-blue-100 text-blue-800' // 'info' or default
        }`;
        
        this.statusIcon.innerHTML = type === 'success' 
            ? '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
            : type === 'error'
            ? '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
            : '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
        
        this.statusText.textContent = message;
        
        if (type === 'success') {
            setTimeout(() => this.statusDisplay.classList.add('hidden'), 5000); // Auto-hide success messages.
        }
    }

    /**
     * Updates the statistics display based on the analysis from the backend.
     * @param {object} analysis - The analysis object from backend (e.g., {'total_keys': ..., 'max_depth': ...}).
     */
    updateStats(analysis) {
        if (!analysis) { // If no analysis data from backend, hide stats.
            this.jsonStats.classList.add('hidden');
            return;
        }
        // Assumes backend provides analysis with keys: total_keys, max_depth, array_count, object_count.
        this.totalProps.textContent = analysis.total_keys !== undefined ? analysis.total_keys : (analysis.totalProperties || 0);
        this.maxDepth.textContent = analysis.max_depth || 0;
        this.arrayCount.textContent = analysis.array_count || 0;
        this.objectCount.textContent = analysis.object_count || 0;
        this.jsonStats.classList.remove('hidden');
    }

    /**
     * Client-side fallback for analyzing JSON data to calculate statistics.
     * This is used if the backend doesn't provide an analysis object.
     * Tries to mimic the structure of backend analysis.
     * @param {*} data - The JSON data to analyze.
     * @returns {object} Statistics object { totalProperties, maxDepth, arrayCount, objectCount }.
     */
    analyzeJSON(data) {
        // Helper to count all keys recursively (properties in objects).
        function countTotalKeysRecursive(item) {
            if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
                let count = Object.keys(item).length;
                for (const value of Object.values(item)) {
                    count += countTotalKeysRecursive(value);
                }
                return count;
            } else if (Array.isArray(item)) {
                 let count = 0; // Array elements themselves are not "keys" in the same way object properties are.
                 for (const subItem of item) {
                     count += countTotalKeysRecursive(subItem); // Sum keys from elements if they are objects.
                 }
                 return count;
             }
            return 0; // Primitives don't have keys.
        }

        // Helper to count arrays recursively.
        function countArraysRecursive(item) {
            let count = Array.isArray(item) ? 1 : 0;
            if (typeof item === 'object' && item !== null) { // Recurse into objects and arrays
                if (Array.isArray(item)) {
                    for (const subItem of item) count += countArraysRecursive(subItem);
                } else { // Object
                    for (const value of Object.values(item)) count += countArraysRecursive(value);
                }
            }
            return count;
        }

        // Helper to count objects recursively.
        function countObjectsRecursive(item) {
            let count = (typeof item === 'object' && item !== null && !Array.isArray(item)) ? 1 : 0;
            if (typeof item === 'object' && item !== null) { // Recurse into objects and arrays
                if (Array.isArray(item)) {
                     for (const subItem of item) count += countObjectsRecursive(subItem);
                } else { // Object
                    for (const value of Object.values(item)) count += countObjectsRecursive(value);
                }
            }
            return count;
        }
        
        // Use the internal _calculate_json_depth_recursive for max depth.
        const calculatedMaxDepth = this._calculate_json_depth_recursive(data, 1);

        return {
            total_keys: countTotalKeysRecursive(data), // Matches backend 'total_keys'
            max_depth: calculatedMaxDepth,             // Matches backend 'max_depth'
            array_count: countArraysRecursive(data),   // Matches backend 'array_count'
            object_count: countObjectsRecursive(data)  // Matches backend 'object_count'
        };
    }
    
    /**
     * Helper function to recursively calculate the maximum depth of a JSON structure.
     * @param {*} data - The data to analyze.
     * @param {number} current_depth - The current depth in recursion.
     * @returns {number} The maximum depth.
     */
    _calculate_json_depth_recursive(data, current_depth) {
         if (typeof data === 'object' && data !== null) {
            let child_depths = [current_depth]; // Start with current depth in case of empty obj/array
            if (Array.isArray(data)) {
                if (data.length === 0) return current_depth;
                data.forEach(item => child_depths.push(this._calculate_json_depth_recursive(item, current_depth + 1)));
            } else { // An actual object
                 const keys = Object.keys(data);
                 if (keys.length === 0) return current_depth;
                 keys.forEach(key => child_depths.push(this._calculate_json_depth_recursive(data[key], current_depth + 1)));
            }
            return Math.max(...child_depths);
         }
         return current_depth; // Primitive types are at the current depth.
     }

    /**
     * Clears the JSON input textarea, output display area, status messages, and hides statistics.
     * Resets the application to its initial state.
     */
    clearAll() {
        this.jsonInput.value = '';
        this.jsonDisplay.innerHTML = `
            <div class="flex items-center justify-center h-64 text-gray-400">
                <div class="text-center">
                    <svg class="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 011-1h1m0 0a2 2 0 011 1v1M9 7h6"></path>
                    </svg>
                    <p class="text-lg">解析后的JSON数据将在此处显示</p>
                    <p class="text-sm">支持树形视图、原始数据和表格展示</p>
                </div>
            </div>
        `;
        this.statusDisplay.classList.add('hidden');
        this.jsonStats.classList.add('hidden');
        this.lastBackendParsedData = null; // Clear any stored data from backend.
        this.fileInput.value = ''; // Clear file input selection
    }

    /**
     * Fetches sample JSON data from the backend API endpoint `/api/sample/`.
     * Populates the input area and displays the fetched data.
     */
    async fetchSampleDataFromBackend() {
        this.showStatus('info', '正在从后端加载示例数据...');
        const endpoint = '/api/sample/'; // Django API endpoint for sample JSON.

        try {
            const response = await fetch(endpoint, { method: 'GET' });

            if (!response.ok) {
                // Attempt to get more detailed error message from backend if available
                const errorData = await response.json().catch(() => ({ message: response.statusText }));
                throw new Error(`HTTP error ${response.status}: ${errorData.message || errorData.error || '无法连接到服务器'}`);
            }

            const result = await response.json(); // Parse backend JSON response.

            if (result.error || !result.success) {
                // Handle application-level errors returned by the backend.
                throw new Error(`后端错误: ${result.message || result.error || '获取示例数据失败'}`);
            }

            if (result.data) {
                this.jsonInput.value = JSON.stringify(result.data, null, 2); // Populate textarea.
                this.lastBackendParsedData = result.data; // Store for view switching.
                this.displayJSON(result.data); // Display the fetched data.
                // Use analysis from backend if available, otherwise perform client-side analysis as fallback.
                this.updateStats(result.analysis || this.analyzeJSON(result.data));
                this.showStatus('success', result.message || '示例数据加载成功');
            } else {
                throw new Error('后端响应中未找到示例数据。');
            }

        } catch (error) {
            console.error('Error fetching sample data:', error);
            this.showStatus('error', `加载示例数据失败: ${error.message}`);
            // Optionally clear display areas on error
            // this.jsonInput.value = '';
            // this.jsonDisplay.innerHTML = '';
            // this.jsonStats.classList.add('hidden');
            // this.lastBackendParsedData = null;
        }
    }

    /**
     * Handles the file input change event (when a user selects a file).
     * Validates the file type and then initiates the upload to the backend.
     * @param {Event} event - The file input change event object.
     */
    handleFileUpload(event) {
        const file = event.target.files[0];
        // Reset file input to allow selecting the same file again if needed.
        event.target.value = null; 

        if (!file) return; // No file selected or dialog cancelled.

        if (file.type !== 'application/json') {
            this.showStatus('error', '请选择有效的JSON文件 (.json)');
            return;
        }
        // File is valid, proceed to upload it to the backend.
        this.uploadJsonFileToBackend(file);
    }

    /**
     * Uploads the selected JSON file to the backend API endpoint `/api/upload/`.
     * Uses FormData for the POST request as required for file uploads.
     * @param {File} file - The JSON file object to upload.
     */
    async uploadJsonFileToBackend(file) {
        this.showStatus('info', `正在上传文件: ${this.escapeHtml(file.name)}...`);
        const endpoint = '/api/upload/'; // Django API endpoint for file upload.
        const formData = new FormData();

        formData.append('json_file', file); // 'json_file' must match backend expected field name.
        // Include CSRF token in FormData for Django's CSRF protection.
        // Field name 'csrfmiddlewaretoken' is standard for Django forms.
        if (this.csrfToken) {
            formData.append('csrfmiddlewaretoken', this.csrfToken);
        } else {
            this.showStatus('error', 'CSRF令牌丢失，无法上传文件。请刷新页面。');
            console.warn('CSRF token is missing. File upload might fail.');
            // Optionally, do not proceed if CSRF token is critical and missing.
            // return; 
        }


        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                body: formData,
                // 'Content-Type' header is automatically set by browser for FormData (multipart/form-data).
                // Do NOT manually set 'Content-Type': 'multipart/form-data' as it can break boundary definitions.
                // 'X-CSRFToken' header is not typically used with FormData; token is part of the body.
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: response.statusText }));
                throw new Error(`HTTP error ${response.status}: ${errorData.message || errorData.error || '文件上传失败'}`);
            }

            const result = await response.json();

            if (result.error || !result.success) {
                throw new Error(`后端错误: ${result.message || result.error || '文件处理失败'}`);
            }
            
            if (result.data) {
                // Populate input area with (potentially processed) JSON from backend.
                this.jsonInput.value = JSON.stringify(result.data, null, 2);
                this.lastBackendParsedData = result.data; // Store for view switching.
                this.displayJSON(result.data); // Display the data.
                this.updateStats(result.analysis || this.analyzeJSON(result.data)); // Update stats.
                this.showStatus('success', result.message || '文件上传和解析成功');
            } else {
                 throw new Error('后端响应中未找到已解析的文件数据。');
            }

        } catch (error) {
            console.error('Error uploading file:', error);
            this.showStatus('error', `文件上传失败: ${error.message}`);
        }
    }

    /**
     * Sends the JSON string from the textarea to the backend API endpoint `/api/parse/`.
     * Performs a local syntax check before sending.
     */
    async sendJsonStringToBackend() {
        const jsonString = this.jsonInput.value.trim();

        if (!jsonString) {
            this.showStatus('error', '请输入JSON数据');
            return;
        }

        // Optional: Perform a quick client-side syntax check before sending to backend.
        // This gives faster feedback for simple syntax errors.
        let localParsedData;
        try {
            localParsedData = JSON.parse(jsonString);
        } catch (localError) {
            this.showStatus('error', `本地JSON格式错误 (未发送到后端): ${localError.message}`);
            this.jsonDisplay.innerHTML = `
                <div class="text-red-600 p-4">
                    <h3 class="font-bold mb-2">本地解析错误 (发送前检测)</h3>
                    <p class="mb-2">${this.escapeHtml(localError.message)}</p>
                    <div class="text-sm text-gray-600">
                        <p>请检查JSON格式。常见错误原因：</p>
                        <ul class="list-disc list-inside mt-1">
                            <li>缺少引号或逗号</li>
                            <li>多余的逗号</li>
                            <li>使用单引号而非双引号</li>
                            <li>未转义的特殊字符</li>
                        </ul>
                    </div>
                </div>`;
            this.jsonStats.classList.add('hidden');
            this.lastBackendParsedData = null;
            return; // Stop if local parse fails.
        }

        this.showStatus('info', '正在发送JSON数据到后端进行解析...');
        const endpoint = '/api/parse/'; // Django API endpoint for string parsing.

        try {
            const headers = {
                'Content-Type': 'application/json',
            };
            // Add CSRF token to headers for POST requests.
            if (this.csrfToken) {
                headers['X-CSRFToken'] = this.csrfToken;
            } else {
                 this.showStatus('error', 'CSRF令牌丢失，无法解析JSON。请刷新页面。');
                 console.warn('CSRF token is missing. JSON string parse might fail.');
                 // return; // Optionally stop if CSRF token is critical and missing.
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: headers,
                // Send the already client-side validated JSON object (localParsedData).
                // Django REST framework can handle this directly if Content-Type is application/json.
                body: JSON.stringify(localParsedData) 
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: response.statusText }));
                // Extract detailed message if backend provides one for invalid JSON.
                let detailedMessage = errorData.message || errorData.error || '解析请求失败';
                if (errorData.line && errorData.column) {
                    detailedMessage += ` (行: ${errorData.line}, 列: ${errorData.column})`;
                }
                throw new Error(`HTTP error ${response.status}: ${detailedMessage}`);
            }

            const result = await response.json();

            if (result.error || !result.success) {
                throw new Error(`后端错误: ${result.message || result.error || 'JSON解析失败'}`);
            }

            if (result.data) {
                // Backend might return a validated/modified version of the JSON.
                // Display data *from the backend response*.
                // this.jsonInput.value = JSON.stringify(result.data, null, 2); // Optionally update input area
                this.lastBackendParsedData = result.data; // Store for view switching.
                this.displayJSON(result.data); // Display the data from backend.
                this.updateStats(result.analysis || this.analyzeJSON(result.data)); // Update stats.
                this.showStatus('success', result.message || 'JSON数据解析成功');
            } else {
                throw new Error('后端响应中未找到已解析的数据。');
            }

        } catch (error) {
            console.error('Error sending JSON string to backend:', error);
            this.showStatus('error', `JSON解析失败: ${error.message}`);
            // Optionally clear display, but keep input for user correction
            // this.jsonDisplay.innerHTML = ''; 
            // this.jsonStats.classList.add('hidden');
            // this.lastBackendParsedData = null;
        }
    }

    /**
     * Retrieves the CSRF token required for Django POST requests.
     * Tries to get it from cookies first (standard Django method), then from a meta tag as a fallback.
     * @returns {string|null} The CSRF token string, or null if not found.
     */
    getCSRFToken() {
        // 1. Try to get CSRF token from cookies (most reliable for Django)
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'csrftoken') { // Default Django CSRF cookie name
                // console.log('CSRF token found in cookie:', value);
                return value;
            }
        }
        
        // 2. Fallback: Try to get CSRF token from a meta tag (if Django template includes it)
        const csrfMeta = document.querySelector('meta[name="csrf-token"]');
        if (csrfMeta) {
             const token = csrfMeta.getAttribute('content');
             if (token && token !== "YOUR_DJANGO_CSRF_TOKEN_HERE") { // Avoid using placeholder
                // console.log('CSRF token found in meta tag:', token);
                return token;
             }
        }

        console.warn('CSRF token not found in cookies or meta tag. POST requests to Django backend may fail.');
        return null; // Token not found or only placeholder found
    }

    /**
     * Escapes HTML special characters in a string to prevent XSS vulnerabilities
     * when injecting text into HTML.
     * @param {string} text - The text to escape.
     * @returns {string} The escaped string.
     */
    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text); // Use textContent for automatic escaping.
        return div.innerHTML; // innerHTML will then provide the escaped string.
    }
}

// Initialize the JSONParser application once the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', () => {
    window.jsonParserApp = new JSONParser(); // Assign to window for easy debugging if needed.
});
