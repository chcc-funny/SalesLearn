---
title: SalesLearn - 运维手册
category: operations
tags: [运维, 监控, 备份]
version: 1.0.0
created: 2026-04-21
last_updated: 2026-04-21
status: active
---

# SalesLearn - 运维手册

## 1. 日常运维

### 1.1 监控检查项

| 检查项 | 频率 | 工具 |
|---|---|---|
| 应用状态 | 实时 | Vercel Dashboard |
| 数据库连接 | 实时 | Neon Dashboard |
| API 响应时间 | 每日 | Vercel Analytics |
| 错误率 | 每日 | Vercel Logs |
| LLM API 用量 | 每周 | OpenRouter Dashboard |
| ASR API 用量 | 每周 | 腾讯云控制台 |
| 存储用量 | 每月 | Vercel Blob / S3 |

### 1.2 日志查看

```bash
# Vercel 实时日志
vercel logs --follow

# 查看特定部署日志
vercel logs <deployment-url>
```

---

## 2. 备份策略

### 2.1 数据库备份
- **自动备份**：Neon 自动每日备份
- **手动备份**：重大操作前使用 Neon Branch 创建快照
- **恢复**：Neon 支持 Point-in-Time Recovery（7天内）

### 2.2 文件备份
- 上传的文件存储在 Vercel Blob，自带冗余
- 建议定期备份重要的知识库资料到本地

---

## 3. 常见问题排查

### 3.1 应用无法访问
1. 检查 Vercel 部署状态
2. 检查域名 DNS 解析
3. 查看 Vercel 构建日志

### 3.2 数据库连接失败
1. 检查 Neon Dashboard 状态
2. 验证 DATABASE_URL 环境变量
3. 检查连接池是否耗尽

### 3.3 LLM 响应异常
1. 检查 OpenRouter API 余额
2. 查看 OpenRouter 状态页面
3. 检查 API Key 是否有效
4. 尝试切换模型（Claude ↔ Kimi）

### 3.4 语音转写失败
1. 检查腾讯云 ASR 服务状态
2. 验证密钥配置
3. 检查音频格式是否支持
4. 查看调用量是否超限

---

## 4. 成本监控

### 4.1 月度预算（MVP 10 人团队）

| 项目 | 预算 | 告警阈值 |
|---|---|---|
| Vercel Pro | $20 | - |
| Neon Pro | $19 | - |
| LLM API | $150 | $120 (80%) |
| ASR API | $80 | $60 (75%) |
| 文件存储 | $5 | - |
| **合计** | **$275** | - |

### 4.2 成本优化策略
- 知识切分/出题使用 Kimi K2（比 Claude 便宜）
- 短文本任务使用 Claude Haiku
- 设置 API 调用频率限制
- 监控异常用量

---

## 5. 扩容指南

当用户量增长时：
1. **数据库**：Neon 自动扩容，必要时升级计划
2. **API**：Vercel Serverless 自动扩容
3. **LLM**：增加 OpenRouter 预算，配置多模型负载均衡
4. **存储**：按需增加 Blob 存储额度
