# Atmostfair 文本修改指南

本文档将指导您如何修改应用中的文本，例如将 Tab 上的 "Games" 修改回 "Project"，或修改其他任何界面文字。

## 1. 核心翻译文件

应用中的所有文本都存储在一个中心化的配置文件中：
**路径**: `src/constants/translations.js`

该文件包含两个主要的语言对象：
- `en`: 英文翻译
- `zh`: 中文翻译

## 2. 如何修改 Tab 名称 (示例)

如果您想将 Tab 栏上的 "Games" 改为 "Project"，请按照以下步骤操作：

1.  打开 `src/constants/translations.js`。
2.  找到 `en` 对象下的 `// Tabs` 注释部分（约第 46 行）。
3.  找到 `games` 字段。
4.  将其值从 `"Games"` 修改为 `"Project"`。

**修改前**:
```javascript
  en: {
    // ...
    // Tabs
    collect: "Collect",
    connect: "Connect",
    select: "Select",
    games: "Games", // <--- 当前值
    // ...
  }
```

**修改后**:
```javascript
  en: {
    // ...
    // Tabs
    collect: "Collect",
    connect: "Connect",
    select: "Select",
    games: "Project", // <--- 修改后的值
    // ...
  }
```

5.  (可选) 向下滚动找到 `zh` 对象（约第 320 行），同样在 `// Tabs` 部分下找到 `games` 字段，将其修改为您想在中文环境下显示的文字（例如 "项目" 或保持 "Project"）。

## 3. 修改其他文本

修改其他文本的原理相同：

1.  **在应用中确定文本内容**：例如您看到了 "Create New Project"。
2.  **在文件中搜索**：在 `translations.js` 中按 `Ctrl+F` 搜索该短语。
    *   注意：如果文本包含动态内容（如 `"Create New {type} Project"`），您可能需要搜索部分关键词（如 "Create New"）。
3.  **修改对应的值**：只修改冒号右侧的字符串内容，不要修改左侧的 Key（键名），否则会导致程序无法找到文本。

## 4. 常见问题

*   **修改后没有生效？**
    *   确保您修改的是当前激活语言的部分（`en` 或 `zh`）。您可以在应用右上角点击切换语言来测试。
    *   保存文件后，Vite 开发服务器通常会自动热更新。如果不行，尝试刷新浏览器。

*   **想添加新的翻译？**
    *   如果代码中使用了新的 Key（例如 `t('newKey')`），您需要手动在 `translations.js` 的 `en` 和 `zh` 下都添加 `newKey: "您的文本",`。
