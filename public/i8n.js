// 定义一个异步函数来加载语言文件
async function loadLanguage(lang) {
  try {
    const response = await fetch(`/i18n.json`);
    if (!response.ok) {
      throw new Error('无法加载语言文件');
    }
    const data = await response.json();
    return data[lang] || data['zh']; // 如果请求的语言不存在，默认使用中文
  } catch (error) {
    console.error('加载语言文件时出错:', error);
    return null;
  }
}

// 定义一个函数来更新页面上的文本
function updatePageText(langData) {
  if (!langData) return;

  // 更新通用元素
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const keys = key.split('.');
    let value = langData;
    for (const k of keys) {
      value = value[k];
      if (!value) break;
    }
    if (value) {
      if (element.tagName === 'INPUT' && element.getAttribute('placeholder')) {
        element.placeholder = value;
      } else {
        element.textContent = value;
      }
    }
  });

  // 更新标题
  document.title = langData.common.appName;
}

// 初始化函数
async function initializeI18n() {
  const userLang = navigator.language || navigator.userLanguage;
  const lang = userLang.split('-')[0]; // 获取主要语言代码
  const langData = await loadLanguage(lang);
  updatePageText(langData);
}

// 当DOM加载完成后初始化国际化
document.addEventListener('DOMContentLoaded', initializeI18n);
