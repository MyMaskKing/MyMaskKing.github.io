// 脚本加载器 - 确保按顺序加载js文件
// 先加载热点站点JS，再加载便捷工具JS

// 创建一个全局命名空间，用于管理插件之间的通信和状态
window.PluginManager = {
    loadedPlugins: {},  // 跟踪已加载的插件
    pluginState: {},    // 存储插件状态
    initialized: false, // 标记管理器是否已初始化
    eventListeners: {}, // 事件监听器
    
    // 注册插件
    registerPlugin: function(name, api) {
        this.loadedPlugins[name] = true;
        this.pluginState[name] = api;
        console.log(`插件已注册: ${name}`);
        
        // 触发插件加载完成事件
        this.triggerEvent('pluginLoaded', { name, api });
    },
    
    // 检查插件是否已加载
    isPluginLoaded: function(name) {
        return !!this.loadedPlugins[name];
    },
    
    // 获取插件API
    getPlugin: function(name) {
        return this.pluginState[name] || null;
    },
    
    // 设置事件监听器
    addEventListener: function(event, callback) {
        if (!this.eventListeners[event]) {
            this.eventListeners[event] = [];
        }
        this.eventListeners[event].push(callback);
    },
    
    // 触发事件
    triggerEvent: function(event, data) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].forEach(callback => {
                try {
                    callback(data);
                } catch (err) {
                    console.error(`事件处理器出错: ${event}`, err);
                }
            });
        }
    },
    
    // 桥接函数 - 安全地调用另一个插件的函数
    callPluginFunction: function(pluginName, funcName, ...args) {
        if (this.isPluginLoaded(pluginName)) {
            const plugin = this.getPlugin(pluginName);
            if (plugin && typeof plugin[funcName] === 'function') {
                try {
                    return plugin[funcName](...args);
                } catch (err) {
                    console.error(`调用插件函数出错: ${pluginName}.${funcName}`, err);
                    return null;
                }
            }
        }
        console.warn(`插件函数不可用: ${pluginName}.${funcName}`);
        return null;
    }
};

// 初始化浏览器检测
window.BrowserDetect = {
    isFirefox: navigator.userAgent.toLowerCase().indexOf('firefox') > -1,
    isEdge: navigator.userAgent.toLowerCase().indexOf('edg') > -1,
    isChrome: navigator.userAgent.toLowerCase().indexOf('chrome') > -1 && navigator.userAgent.toLowerCase().indexOf('edg') === -1,
    isMobile: window.innerWidth <= 1200
};

// 检查页面是否存在目录
function checkTocExistence() {
    // 检查常见的目录元素
    const tocSelectors = [
        '.toc', 
        '#toc', 
        '.table-of-contents', 
        '#table-of-contents',
        '.post-toc',
        '.article-toc',
        '.markdown-toc',
        '.mobile-toc-btn',
        '[data-role="toc"]',
        '.sidebar-toc'
    ];
    
    // 搜索所有可能的目录元素
    for (const selector of tocSelectors) {
        const tocElement = document.querySelector(selector);
        if (tocElement) {
            console.log(`加载器检测到目录元素: ${selector}`);
            return true;
        }
    }
    
    // 额外检查是否有通过移动端目录按钮
    const mobileTocBtn = document.querySelector('.mobile-toc-btn, .toc-mobile-btn, .btn-toc, [data-role="toc-btn"]');
    if (mobileTocBtn) {
        console.log('加载器检测到移动端目录按钮');
        return true;
    }
    
    console.log('加载器未检测到目录元素');
    return false;
}

// 设置全局的基本配置和状态
function setupGlobalConfig() {
    // 将目录状态暴露为全局变量，供各脚本使用
    window.hasToc = checkTocExistence();
    console.log("目录状态：", window.hasToc ? "存在" : "不存在");
    
    // 提前获取当前域名，方便构建各种路径
    window.currentDomain = window.location.origin;
    
    // 判断当前环境
    window.isLocalEnv = window.location.protocol === 'file:' || 
                       window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1';
    
    // 输出环境信息
    console.log(`当前环境: ${window.isLocalEnv ? '本地测试' : '网络环境'}`);
    console.log(`当前域名: ${window.currentDomain}`);
    console.log(`当前浏览器: ${BrowserDetect.isFirefox ? 'Firefox' : (BrowserDetect.isEdge ? 'Edge' : 'Chrome/其他')}`);
    console.log(`是否移动视图: ${BrowserDetect.isMobile ? '是' : '否'}`);
    
    // 输出配置文件路径信息
    console.log("配置文件路径: 热门站点配置 -> " + window.location.origin + "/static/config/hot_site.json");
    console.log("配置文件路径: 便捷工具配置 -> " + window.location.origin + "/static/config/quick_tools.json");
    
    // 设置全局点击处理逻辑
    setupGlobalClickHandler();
}

// 全局点击处理函数 - 用于解决插件间的冲突
function setupGlobalClickHandler() {
    // 移除之前的点击处理器(如果存在)
    if (window.documentGlobalClickHandler) {
        document.removeEventListener('click', window.documentGlobalClickHandler);
    }
    
    // 创建新的统一点击处理器
    window.documentGlobalClickHandler = function(event) {
        // 触发插件管理器的点击事件，让各插件自行处理
        window.PluginManager.triggerEvent('documentClick', {
            event: event,
            target: event.target
        });
    };
    
    // 添加全局点击处理器
    document.addEventListener('click', window.documentGlobalClickHandler);
    console.log('全局点击处理器已设置');
}

// 按顺序加载脚本的函数 - 增强版，支持Firefox特殊处理
function loadScriptsSequentially(scripts, callback) {
    let index = 0;
    const scriptRetryStatus = {}; // 记录脚本重试状态
    const MAX_RETRIES = 3;        // 最大重试次数
    
    function loadNext() {
        if (index < scripts.length) {
            const scriptSrc = scripts[index];
            console.log(`加载脚本: ${scriptSrc}`);
            
            // 如果有目录且当前是便捷工具JS，则跳过加载
            const hasToc = window.hasToc || checkTocExistence();
            if (hasToc && scriptSrc.includes('quick-tools.js')) {
                console.log(`检测到目录存在，跳过加载便捷工具JS: ${scriptSrc}`);
                index++;
                loadNext();
                return;
            }
            
            // 根据浏览器选择合适的脚本源
            let actualScriptSrc = scriptSrc;
            
            // Firefox特殊处理
            if (BrowserDetect.isFirefox && window.isLocalEnv && scriptSrc.includes('D:')) {
                // Firefox不能加载本地文件系统路径，调整为相对路径
                if (scriptSrc.includes('hot-sites.js')) {
                    actualScriptSrc = '/static/js/plugins/hot-sites.js';
                } else if (scriptSrc.includes('quick-tools.js')) {
                    actualScriptSrc = '/static/js/plugins/quick-tools.js';
                }
                console.log(`Firefox特殊处理: ${scriptSrc} → ${actualScriptSrc}`);
            } else if (window.isLocalEnv) {
                // 对于本地环境，非Firefox浏览器保持使用绝对路径
                console.log(`使用本地路径: ${scriptSrc}`);
            } else {
                // 网络环境，修正路径中的js/plugins为static/js/plugins
                if (scriptSrc.includes('/js/plugins/')) {
                    actualScriptSrc = scriptSrc.replace('/js/plugins/', '/static/js/plugins/');
                    console.log(`修正网络路径: ${scriptSrc} → ${actualScriptSrc}`);
                }
            }
            
            // 创建脚本元素
            const script = document.createElement('script');
            script.src = actualScriptSrc;
            script.async = false; // 禁用异步加载，确保按顺序
            
            // 脚本加载成功
            script.onload = function() {
                console.log(`脚本加载成功: ${actualScriptSrc}`);
                
                // 记录这个插件已经加载到PluginManager中
                let pluginName = '';
                if (actualScriptSrc.includes('hot-sites.js')) {
                    pluginName = 'hotSites';
                    
                    // 确保在小屏幕设备上热门按钮可见
                    if (BrowserDetect.isMobile && typeof window.ensureButtonVisibility === 'function') {
                        setTimeout(() => {
                            window.ensureButtonVisibility();
                        }, 500);
                    }
                } else if (actualScriptSrc.includes('quick-tools.js')) {
                    pluginName = 'quickTools';
                }
                
                if (pluginName && !window.PluginManager.isPluginLoaded(pluginName)) {
                    // 注册插件到Plugin Manager
                    window.PluginManager.registerPlugin(pluginName, {
                        name: pluginName,
                        loaded: true,
                        source: actualScriptSrc
                    });
                }
                
                // 继续下一个脚本
                index++;
                loadNext();
            };
            
            // 脚本加载失败
            script.onerror = function() {
                console.error(`脚本加载失败: ${actualScriptSrc}`);
                
                // 记录失败次数
                scriptRetryStatus[actualScriptSrc] = (scriptRetryStatus[actualScriptSrc] || 0) + 1;
                
                // 检查是否应该重试
                if (scriptRetryStatus[actualScriptSrc] <= MAX_RETRIES) {
                    console.log(`重试加载脚本(${scriptRetryStatus[actualScriptSrc]}/${MAX_RETRIES}): ${actualScriptSrc}`);
                    
                    // 针对Firefox进行特殊处理 - 尝试不同的路径格式
                    if (BrowserDetect.isFirefox) {
                        let fallbackSrc;
                        
                        if (actualScriptSrc.includes('hot-sites.js')) {
                            fallbackSrc = actualScriptSrc.startsWith('/') 
                                ? `${window.location.origin}/static/js/plugins/hot-sites.js` 
                                : '/static/js/plugins/hot-sites.js';
                        } else if (actualScriptSrc.includes('quick-tools.js')) {
                            fallbackSrc = actualScriptSrc.startsWith('/') 
                                ? `${window.location.origin}/static/js/plugins/quick-tools.js` 
                                : '/static/js/plugins/quick-tools.js';
                        }
                        
                        console.log(`Firefox尝试备用路径: ${fallbackSrc}`);
                        actualScriptSrc = fallbackSrc;
                    }
                    
                    // 短暂延迟后重试
                    setTimeout(() => {
                        const retryScript = document.createElement('script');
                        retryScript.src = actualScriptSrc;
                        retryScript.async = false;
                        
                        retryScript.onload = function() {
                            console.log(`重试成功: ${actualScriptSrc}`);
                            
                            // 记录插件加载
                            let pluginName = '';
                            if (actualScriptSrc.includes('hot-sites.js')) {
                                pluginName = 'hotSites';
                            } else if (actualScriptSrc.includes('quick-tools.js')) {
                                pluginName = 'quickTools';
                            }
                            
                            if (pluginName && !window.PluginManager.isPluginLoaded(pluginName)) {
                                window.PluginManager.registerPlugin(pluginName, {
                                    name: pluginName,
                                    loaded: true,
                                    source: actualScriptSrc
                                });
                            }
                            
                            index++;
                            loadNext();
                        };
                        
                        retryScript.onerror = function() {
                            console.error(`重试失败: ${actualScriptSrc}`);
                            
                            // 继续下一个脚本
                            index++;
                            loadNext();
                        };
                        
                        document.head.appendChild(retryScript);
                    }, 1000 * scriptRetryStatus[actualScriptSrc]);
                } else {
                    console.error(`脚本 ${actualScriptSrc} 加载失败，已达最大重试次数`);
                    
                    // 继续下一个脚本
                    index++;
                    loadNext();
                }
            };
            
            // 添加脚本到文档
            document.head.appendChild(script);
        } else if (typeof callback === 'function') {
            // 所有脚本加载完成，执行回调
            callback();
        }
    }
    
    // 开始加载第一个脚本
    loadNext();
}

// 需要按顺序加载的脚本列表
const scripts = (() => {
    // 设置全局基础配置
    setupGlobalConfig();
    
    // 根据当前环境确定脚本路径
    if (window.isLocalEnv) {
        // 本地测试环境
        console.log('使用本地测试路径');
        
        if (BrowserDetect.isFirefox) {
            // Firefox浏览器使用相对路径
            console.log('Firefox浏览器使用相对路径');
            return [
                '/static/js/plugins/hot-sites.js',
                '/static/js/plugins/quick-tools.js'
            ];
        } else {
            // 其他浏览器使用绝对路径
            return [
                `D:/AboutDev/Workspace_AI/MyMaskKing.github.io/static/js/plugins/hot-sites.js`,
                `D:/AboutDev/Workspace_AI/MyMaskKing.github.io/static/js/plugins/quick-tools.js`
            ];
        }
    } else {
        // 网络环境
        console.log('使用网络环境路径');
        return [
            `${window.currentDomain}/js/plugins/hot-sites.js`,
            `${window.currentDomain}/js/plugins/quick-tools.js`
        ];
    }
})();

// 在DOM加载完成后开始加载脚本
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM已加载，开始按顺序加载插件脚本');
    
    // 加载脚本
    loadScriptsSequentially(scripts, function() {
        console.log('所有插件脚本加载完成');
        
        // 确保热门按钮在移动设备上可见
        if (BrowserDetect.isMobile && typeof window.ensureButtonVisibility === 'function') {
            setTimeout(() => {
                window.ensureButtonVisibility();
                console.log('最终确认：热门按钮可见性已检查');
            }, 1000);
        }
    });
});
