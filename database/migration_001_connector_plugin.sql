-- ============================================================
-- Migration 001: Connector Plugin Architecture
-- Bổ sung schema cho Connector Registry, Metrics, Health,
-- Circuit Breaker, Monitoring Events
-- ============================================================

USE paymentdb;

-- ============================================================
-- 1. MỞ RỘNG connectors TABLE
-- ============================================================
DROP TABLE IF EXISTS connectors;

CREATE TABLE IF NOT EXISTS connectors (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  name              VARCHAR(255) NOT NULL,
  code              VARCHAR(50) NOT NULL UNIQUE COMMENT 'connector_type code: vnpay, momo, zalopay',
  version           VARCHAR(50) NOT NULL COMMENT 'Semantic versioning (MAJOR.MINOR.PATCH)',
  description       TEXT,
  status            ENUM('Registered','Active','Inactive','Error','Maintenance') NOT NULL DEFAULT 'Registered',
  config_schema     JSON COMMENT 'Dynamic schema do Connector định nghĩa',
  supported_methods JSON COMMENT 'Array: ["createTransaction","refund","generateQR",...]',
  supported_protocols JSON COMMENT 'Array: ["REST","SOAP","MQ","SFTP","OpenAPI","Proprietary"]',
  core_compatibility VARCHAR(50) COMMENT 'Phiên bản Core tương thích (semver range)',
  health_status     ENUM('Healthy','Degraded','Unhealthy') DEFAULT NULL,
  health_last_check DATETIME,
  health_latency    INT COMMENT 'ms',
  health_uptime_percent DECIMAL(5,2),
  health_uptime_start DATETIME,
  is_active         TINYINT(1) NOT NULL DEFAULT 0,
  deployed_at       DATETIME,
  activated_at      DATETIME,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_connectors_code (code),
  INDEX idx_connectors_status (status),
  INDEX idx_connectors_health (health_status)
) ENGINE=InnoDB;

-- ============================================================
-- 2. CONNECTOR METRICS SNAPSHOTS
-- ============================================================
CREATE TABLE IF NOT EXISTS connector_metrics (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  connector_id        INT NOT NULL,
  recorded_at         DATETIME NOT NULL COMMENT 'Thời điểm lấy metrics',
  tps                 DECIMAL(10,2) COMMENT 'Transactions per second',
  latency_avg_ms      INT COMMENT 'Latency trung bình (ms)',
  latency_p95_ms      INT COMMENT 'P95 latency (ms)',
  latency_p99_ms      INT COMMENT 'P99 latency (ms)',
  success_rate        DECIMAL(5,2) COMMENT 'Tỷ lệ thành công %',
  failure_rate        DECIMAL(5,2) COMMENT 'Tỷ lệ thất bại %',
  timeout_rate        DECIMAL(5,2) COMMENT 'Tỷ lệ timeout %',
  refund_success_rate DECIMAL(5,2) COMMENT 'Tỷ lệ hoàn tiền thành công %',
  total_requests      BIGINT NOT NULL DEFAULT 0,
  total_failures      BIGINT NOT NULL DEFAULT 0,
  total_timeouts      BIGINT NOT NULL DEFAULT 0,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cmetrics_connector (connector_id),
  INDEX idx_cmetrics_time (recorded_at),
  CONSTRAINT fk_cmetrics_connector FOREIGN KEY (connector_id) REFERENCES connectors(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 3. CONNECTOR HEALTH CHECK LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS connector_health_logs (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  connector_id      INT NOT NULL,
  status            ENUM('Healthy','Degraded','Unhealthy') NOT NULL,
  latency_ms        INT COMMENT 'Thời gian phản hồi health check',
  error_message     TEXT,
  response_status   INT COMMENT 'HTTP status code nếu có',
  checked_at        DATETIME NOT NULL COMMENT 'Thời điểm kiểm tra',
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_chealth_connector (connector_id),
  INDEX idx_chealth_time (checked_at),
  CONSTRAINT fk_chealth_connector FOREIGN KEY (connector_id) REFERENCES connectors(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 4. CONNECTOR CIRCUIT BREAKER STATES
-- ============================================================
CREATE TABLE IF NOT EXISTS connector_circuit_breaker_states (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  connector_id        INT NOT NULL UNIQUE,
  state               ENUM('Closed','Open','HalfOpen') NOT NULL DEFAULT 'Closed',
  failure_count       INT NOT NULL DEFAULT 0,
  last_failure_at     DATETIME,
  last_success_at     DATETIME,
  opened_at           DATETIME,
  half_open_after_sec INT NOT NULL DEFAULT 300 COMMENT 'Thời gian chờ trước khi chuyển HalfOpen (giây)',
  recovery_attempts   INT NOT NULL DEFAULT 0,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cb_connector (connector_id),
  INDEX idx_cb_state (state),
  CONSTRAINT fk_cb_connector FOREIGN KEY (connector_id) REFERENCES connectors(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 5. CONNECTOR EVENTS / ALERTS
-- ============================================================
CREATE TABLE IF NOT EXISTS connector_events (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  connector_id      INT NOT NULL,
  event_type        ENUM('ConnectorDown','HighErrorRate','HighLatency','WebhookFailure','CircuitBreakerOpened','CircuitBreakerClosed','Recovery','Deactivated') NOT NULL,
  severity          ENUM('Critical','Warning','Info') NOT NULL DEFAULT 'Warning',
  message           TEXT NOT NULL,
  metric_value      DECIMAL(15,2) COMMENT 'Giá trị metric tại thời điểm event',
  threshold         DECIMAL(15,2) COMMENT 'Ngưỡng cảnh báo',
  acknowledged      TINYINT(1) NOT NULL DEFAULT 0,
  acknowledged_by   INT,
  acknowledged_at   DATETIME,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cevent_connector (connector_id),
  INDEX idx_cevent_type (event_type),
  INDEX idx_cevent_severity (severity),
  INDEX idx_cevent_ack (acknowledged),
  INDEX idx_cevent_time (created_at),
  CONSTRAINT fk_cevent_connector FOREIGN KEY (connector_id) REFERENCES connectors(id) ON DELETE CASCADE,
  CONSTRAINT fk_cevent_ack_by FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================
-- 6. THÊM COLUMN vault_path CHO partner_configs
-- Hỗ trợ Secret Management qua Vault/KMS
-- ============================================================
ALTER TABLE partner_configs
  ADD COLUMN vault_path VARCHAR(500) DEFAULT NULL COMMENT 'Đường dẫn secret trong Vault/KMS' AFTER secret_key;
