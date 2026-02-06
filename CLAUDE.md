# Product Scout

东南亚 TikTok 选品自动化工具。采集 TikTok 热门视频 → 匹配 Shopee 商品 → 筛选打分 → 同步 Notion。

## 技术栈

Bun + TypeScript + Zod + SQLite + Playwright + Apify

## 常用命令

```
bun install          # 安装依赖
bun run lint         # 检查 + 修复
bun test             # 运行测试
bun run scripts/scout.ts --region th   # 执行选品
bun run scripts/status.ts              # 查看状态
bun run scripts/top.ts --limit 10      # Top N 候选品
```

## 目录结构

- `scripts/` - 可执行脚本
- `src/scrapers/` - 数据采集
- `src/api/` - 外部 API
- `src/core/` - 核心业务
- `src/schemas/` - Zod 验证
- `src/utils/` - 工具函数
- `config/` - 配置文件

## 敏感文件

不要读取或修改：
- `config/secrets.yaml` - API 密钥
- `db/*.db` - 数据库文件
