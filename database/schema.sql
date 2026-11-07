-- ============================================================
-- BizOne Database Schema - MariaDB 10.11
-- Omni Channel POS & Management Platform
-- ============================================================

CREATE DATABASE IF NOT EXISTS bizonedb
  CHARACTER SET utf8
  COLLATE utf8_general_ci;

USE bizonedb;

-- ============================================================
-- 1. CORE / SYSTEM TABLES
-- ============================================================

-- 1.1 Branches (Chi nhánh)
CREATE TABLE IF NOT EXISTS branches (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  code        VARCHAR(50)  NOT NULL UNIQUE,
  address     TEXT,
  phone       VARCHAR(20),
  email       VARCHAR(255),
  tax_code    VARCHAR(50),
  status      ENUM('active','inactive') NOT NULL DEFAULT 'active',
  is_default  TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 1.2 Roles (Vai trò)
CREATE TABLE IF NOT EXISTS roles (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  code        VARCHAR(50)  NOT NULL UNIQUE,
  description TEXT,
  is_system   TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 1.3 Permissions (Quyền)
CREATE TABLE IF NOT EXISTS permissions (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  module      VARCHAR(50)  NOT NULL,
  action      VARCHAR(50)  NOT NULL,
  name        VARCHAR(200) NOT NULL,
  code        VARCHAR(100) NOT NULL UNIQUE,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 1.4 Role-Permission Mapping
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INT NOT NULL,
  permission_id INT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role       FOREIGN KEY (role_id)       REFERENCES roles(id)       ON DELETE CASCADE,
  CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 1.5 Users (Nhân viên / Người dùng)
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(255) NOT NULL,
  email         VARCHAR(255),
  phone         VARCHAR(20),
  avatar        VARCHAR(500),
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  last_login_at DATETIME,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 1.6 User-Role Assignment (per branch)
CREATE TABLE IF NOT EXISTS user_roles (
  user_id   INT NOT NULL,
  role_id   INT NOT NULL,
  branch_id INT,
  PRIMARY KEY (user_id, role_id, branch_id),
  CONSTRAINT fk_ur_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
  CONSTRAINT fk_ur_role   FOREIGN KEY (role_id)   REFERENCES roles(id)   ON DELETE CASCADE,
  CONSTRAINT fk_ur_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 1.7 User-Branch Assignment
CREATE TABLE IF NOT EXISTS user_branches (
  user_id     INT NOT NULL,
  branch_id   INT NOT NULL,
  is_default  TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, branch_id),
  CONSTRAINT fk_ub_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
  CONSTRAINT fk_ub_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 1.8 User Sessions (JWT / Refresh Token)
CREATE TABLE IF NOT EXISTS user_sessions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT          NOT NULL,
  token         VARCHAR(500) NOT NULL UNIQUE,
  refresh_token VARCHAR(500) NOT NULL UNIQUE,
  ip_address    VARCHAR(45),
  user_agent    TEXT,
  expires_at    DATETIME     NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_us_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 1.9 Audit Log
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT,
  action      VARCHAR(50)  NOT NULL,
  module      VARCHAR(50)  NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id   INT,
  old_value   TEXT,
  new_value   TEXT,
  ip_address  VARCHAR(45),
  user_agent  TEXT,
  notes       TEXT,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_al_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_audit_module   ON audit_logs(module);
CREATE INDEX idx_audit_action   ON audit_logs(action);
CREATE INDEX idx_audit_created  ON audit_logs(created_at);
CREATE INDEX idx_audit_entity   ON audit_logs(entity_type, entity_id);

-- ============================================================
-- 2. PRODUCT MANAGEMENT
-- ============================================================

-- 2.1 Product Categories (tree, max 5 levels)
CREATE TABLE IF NOT EXISTS product_categories (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  slug       VARCHAR(255) NOT NULL UNIQUE,
  parent_id  INT,
  sort_order INT          NOT NULL DEFAULT 0,
  icon       VARCHAR(500),
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pc_parent FOREIGN KEY (parent_id) REFERENCES product_categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_category_parent ON product_categories(parent_id);

-- 2.2 Products
CREATE TABLE IF NOT EXISTS products (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(500) NOT NULL,
  sku             VARCHAR(100) NOT NULL UNIQUE,
  barcode         VARCHAR(100) UNIQUE,
  category_id     INT,
  description     TEXT,
  cost_price      DECIMAL(15,2) NOT NULL DEFAULT 0,
  selling_price   DECIMAL(15,2) NOT NULL DEFAULT 0,
  tax_rate        DECIMAL(5,2)  NOT NULL DEFAULT 0,
  unit            VARCHAR(50)   NOT NULL,
  weight          DECIMAL(10,2),
  min_stock       INT           NOT NULL DEFAULT 0,
  max_stock       INT,
  image           VARCHAR(500),
  status          ENUM('active','inactive','discontinued') NOT NULL DEFAULT 'active',
  track_inventory TINYINT(1)    NOT NULL DEFAULT 1,
  created_by      INT,
  updated_by      INT,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_prod_category FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_prod_cby      FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_prod_uby      FOREIGN KEY (updated_by)  REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_product_status ON products(status);
CREATE INDEX idx_product_name   ON products(name);
CREATE INDEX idx_product_sku    ON products(sku);
CREATE INDEX idx_product_barcode ON products(barcode);

-- 2.3 Product Images
CREATE TABLE IF NOT EXISTS product_images (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  image_url  VARCHAR(500) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pi_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_pi_product ON product_images(product_id);

-- 2.4 Product Units (Đa đơn vị tính)
CREATE TABLE IF NOT EXISTS product_units (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  product_id      INT            NOT NULL,
  unit_name       VARCHAR(50)    NOT NULL,
  conversion_rate DECIMAL(15,4)  NOT NULL DEFAULT 1,
  barcode         VARCHAR(100)   UNIQUE,
  selling_price   DECIMAL(15,2),
  cost_price      DECIMAL(15,2),
  is_base         TINYINT(1)     NOT NULL DEFAULT 0,
  created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pu_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_pu_product ON product_units(product_id);

-- 2.5 Product Variants (Biến thể: màu sắc, kích cỡ...)
CREATE TABLE IF NOT EXISTS product_variants (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  product_id    INT            NOT NULL,
  sku           VARCHAR(100)   NOT NULL UNIQUE,
  barcode       VARCHAR(100)   UNIQUE,
  image         VARCHAR(500),
  cost_price    DECIMAL(15,2)  NOT NULL DEFAULT 0,
  selling_price DECIMAL(15,2)  NOT NULL DEFAULT 0,
  weight        DECIMAL(10,2),
  status        ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pv_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_pv_product ON product_variants(product_id);
CREATE INDEX idx_pv_sku     ON product_variants(sku);

-- 2.6 Variant Attributes (Thuộc tính biến thể)
CREATE TABLE IF NOT EXISTS product_variant_attributes (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  variant_id      INT         NOT NULL,
  attribute_name  VARCHAR(50) NOT NULL,
  attribute_value VARCHAR(50) NOT NULL,
  created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pva_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_pva_variant ON product_variant_attributes(variant_id);

-- 2.7 Product Barcodes (additional barcodes)
CREATE TABLE IF NOT EXISTS product_barcodes (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT          NOT NULL,
  variant_id INT,
  barcode    VARCHAR(100) NOT NULL UNIQUE,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pb_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_pb_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 2.8 Combo Items (Sản phẩm combo)
CREATE TABLE IF NOT EXISTS product_combo_items (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  combo_id   INT NOT NULL,
  product_id INT NOT NULL,
  quantity   INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pci_combo   FOREIGN KEY (combo_id)   REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_pci_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_pci_combo ON product_combo_items(combo_id);

-- ============================================================
-- 3. WAREHOUSE / INVENTORY
-- ============================================================

-- 3.1 Warehouses
CREATE TABLE IF NOT EXISTS warehouses (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  branch_id  INT,
  name       VARCHAR(255) NOT NULL,
  code       VARCHAR(50)  NOT NULL UNIQUE,
  address    TEXT,
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_wh_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 3.2 Inventory (Current stock)
CREATE TABLE IF NOT EXISTS inventory (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  product_id   INT            NOT NULL,
  warehouse_id INT            NOT NULL,
  variant_id   INT,
  quantity     DECIMAL(15,2)  NOT NULL DEFAULT 0,
  min_quantity INT            NOT NULL DEFAULT 0,
  max_quantity INT,
  created_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_inv_product   FOREIGN KEY (product_id)   REFERENCES products(id)        ON DELETE CASCADE,
  CONSTRAINT fk_inv_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)       ON DELETE CASCADE,
  CONSTRAINT fk_inv_variant   FOREIGN KEY (variant_id)   REFERENCES product_variants(id) ON DELETE CASCADE,
  UNIQUE KEY uq_inventory (product_id, warehouse_id, variant_id)
) ENGINE=InnoDB;
CREATE INDEX idx_inv_product   ON inventory(product_id);
CREATE INDEX idx_inv_warehouse ON inventory(warehouse_id);
CREATE INDEX idx_inv_quantity  ON inventory(quantity);

-- 3.3 Inventory Batches (Lô / HSD)
CREATE TABLE IF NOT EXISTS inventory_batches (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  product_id      INT            NOT NULL,
  warehouse_id    INT            NOT NULL,
  batch_code      VARCHAR(100)   NOT NULL,
  quantity        DECIMAL(15,2)  NOT NULL DEFAULT 0,
  cost_price      DECIMAL(15,2),
  manufacture_date DATE,
  expiry_date     DATE,
  created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ib_product   FOREIGN KEY (product_id)   REFERENCES products(id)   ON DELETE CASCADE,
  CONSTRAINT fk_ib_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)  ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_ib_product   ON inventory_batches(product_id, warehouse_id);
CREATE INDEX idx_ib_expiry    ON inventory_batches(expiry_date);

-- 3.4 Inventory Transaction Types
CREATE TABLE IF NOT EXISTS inventory_transaction_types (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  code      VARCHAR(50) NOT NULL UNIQUE,
  name      VARCHAR(200) NOT NULL,
  direction ENUM('in','out') NOT NULL
) ENGINE=InnoDB;

-- 3.5 Inventory Transactions (Phiếu nhập / xuất / chuyển / kiểm kê)
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  transaction_code        VARCHAR(100) NOT NULL UNIQUE,
  transaction_type_id     INT NOT NULL,
  warehouse_id            INT NOT NULL,
  destination_warehouse_id INT,
  reference_type          VARCHAR(50),
  reference_id            INT,
  notes                   TEXT,
  created_by              INT,
  status                  ENUM('draft','confirmed','cancelled') NOT NULL DEFAULT 'draft',
  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_it_type     FOREIGN KEY (transaction_type_id)       REFERENCES inventory_transaction_types(id) ON DELETE RESTRICT,
  CONSTRAINT fk_it_wh       FOREIGN KEY (warehouse_id)              REFERENCES warehouses(id)                  ON DELETE RESTRICT,
  CONSTRAINT fk_it_dest_wh  FOREIGN KEY (destination_warehouse_id)  REFERENCES warehouses(id)                  ON DELETE SET NULL,
  CONSTRAINT fk_it_created  FOREIGN KEY (created_by)                REFERENCES users(id)                       ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_it_warehouse   ON inventory_transactions(warehouse_id);
CREATE INDEX idx_it_created     ON inventory_transactions(created_at);
CREATE INDEX idx_it_status      ON inventory_transactions(status);
CREATE INDEX idx_it_reference   ON inventory_transactions(reference_type, reference_id);

-- 3.6 Inventory Transaction Items
CREATE TABLE IF NOT EXISTS inventory_transaction_items (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  transaction_id INT            NOT NULL,
  product_id     INT            NOT NULL,
  variant_id     INT,
  batch_id       INT,
  quantity       DECIMAL(15,2)  NOT NULL,
  unit_cost      DECIMAL(15,2),
  notes          TEXT,
  CONSTRAINT fk_iti_trans   FOREIGN KEY (transaction_id) REFERENCES inventory_transactions(id) ON DELETE CASCADE,
  CONSTRAINT fk_iti_product FOREIGN KEY (product_id)     REFERENCES products(id)                ON DELETE RESTRICT,
  CONSTRAINT fk_iti_variant FOREIGN KEY (variant_id)     REFERENCES product_variants(id)        ON DELETE SET NULL,
  CONSTRAINT fk_iti_batch   FOREIGN KEY (batch_id)       REFERENCES inventory_batches(id)       ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_iti_trans ON inventory_transaction_items(transaction_id);

-- 3.7 Stock Take Notes (Phiếu kiểm kê)
CREATE TABLE IF NOT EXISTS stock_take_notes (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  code         VARCHAR(100) NOT NULL UNIQUE,
  warehouse_id INT NOT NULL,
  notes        TEXT,
  status       ENUM('draft','in_progress','completed','cancelled') NOT NULL DEFAULT 'draft',
  created_by   INT,
  approved_by  INT,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  CONSTRAINT fk_stn_wh        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT,
  CONSTRAINT fk_stn_created   FOREIGN KEY (created_by)   REFERENCES users(id)      ON DELETE SET NULL,
  CONSTRAINT fk_stn_approved  FOREIGN KEY (approved_by)  REFERENCES users(id)      ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_stn_status ON stock_take_notes(status);
CREATE INDEX idx_stn_wh     ON stock_take_notes(warehouse_id);

-- 3.8 Stock Take Items
CREATE TABLE IF NOT EXISTS stock_take_items (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  stock_take_id   INT            NOT NULL,
  product_id      INT            NOT NULL,
  variant_id      INT,
  system_quantity DECIMAL(15,2)  NOT NULL DEFAULT 0,
  actual_quantity DECIMAL(15,2)  NOT NULL DEFAULT 0,
  difference      DECIMAL(15,2)  NOT NULL DEFAULT 0,
  unit_cost       DECIMAL(15,2),
  notes           TEXT,
  CONSTRAINT fk_sti_take    FOREIGN KEY (stock_take_id) REFERENCES stock_take_notes(id) ON DELETE CASCADE,
  CONSTRAINT fk_sti_product FOREIGN KEY (product_id)    REFERENCES products(id)          ON DELETE RESTRICT,
  CONSTRAINT fk_sti_variant FOREIGN KEY (variant_id)    REFERENCES product_variants(id)  ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_sti_take ON stock_take_items(stock_take_id);

-- ============================================================
-- 4. CRM (CUSTOMER MANAGEMENT)
-- ============================================================

-- 4.1 Customer Groups
CREATE TABLE IF NOT EXISTS customer_groups (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(255) NOT NULL,
  code             VARCHAR(50)  NOT NULL UNIQUE,
  description      TEXT,
  discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  is_default       TINYINT(1)   NOT NULL DEFAULT 0,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 4.2 Customers
CREATE TABLE IF NOT EXISTS customers (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  code         VARCHAR(50)  NOT NULL UNIQUE,
  full_name    VARCHAR(255) NOT NULL,
  phone        VARCHAR(20)  NOT NULL UNIQUE,
  email        VARCHAR(255),
  gender       ENUM('male','female','other'),
  birthday     DATE,
  group_id     INT,
  ranking      ENUM('silver','gold','vip','diamond') NOT NULL DEFAULT 'silver',
  total_spent  DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_points INT          NOT NULL DEFAULT 0,
  notes        TEXT,
  debt_limit   DECIMAL(15,2) NOT NULL DEFAULT 0,
  is_active    TINYINT(1)    NOT NULL DEFAULT 1,
  created_by   INT,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cust_group   FOREIGN KEY (group_id)   REFERENCES customer_groups(id) ON DELETE SET NULL,
  CONSTRAINT fk_cust_created FOREIGN KEY (created_by) REFERENCES users(id)            ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_cust_phone  ON customers(phone);
CREATE INDEX idx_cust_name   ON customers(full_name);
CREATE INDEX idx_cust_ranking ON customers(ranking);
CREATE INDEX idx_cust_active ON customers(is_active);

-- 4.3 Customer Addresses
CREATE TABLE IF NOT EXISTS customer_addresses (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  address     TEXT NOT NULL,
  is_default  TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ca_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_ca_customer ON customer_addresses(customer_id);

-- 4.4 Customer Loyalty Points
CREATE TABLE IF NOT EXISTS customer_loyalty_points (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  customer_id    INT            NOT NULL,
  points         INT            NOT NULL,
  type           ENUM('earn','redeem','expire','adjust') NOT NULL,
  reference_type VARCHAR(50),
  reference_id   INT,
  notes          TEXT,
  created_by     INT,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_clp_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_clp_created  FOREIGN KEY (created_by)  REFERENCES users(id)     ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_clp_customer ON customer_loyalty_points(customer_id);
CREATE INDEX idx_clp_created  ON customer_loyalty_points(created_at);

-- 4.5 Customer Debts (Công nợ phải thu)
CREATE TABLE IF NOT EXISTS customer_debts (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  customer_id      INT            NOT NULL,
  invoice_id       INT,
  total_amount     DECIMAL(15,2)  NOT NULL,
  paid_amount      DECIMAL(15,2)  NOT NULL DEFAULT 0,
  remaining_amount DECIMAL(15,2)  NOT NULL,
  due_date         DATE,
  status           ENUM('pending','partial','paid','overdue') NOT NULL DEFAULT 'pending',
  notes            TEXT,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cd_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_cd_customer ON customer_debts(customer_id);
CREATE INDEX idx_cd_status   ON customer_debts(status);
CREATE INDEX idx_cd_due_date ON customer_debts(due_date);

-- ============================================================
-- 5. POS (POINT OF SALE)
-- ============================================================

-- 5.1 Cash Sessions (Ca / Khóa ca)
CREATE TABLE IF NOT EXISTS cash_sessions (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  branch_id               INT            NOT NULL,
  user_id                 INT            NOT NULL,
  opened_at               DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at               DATETIME,
  opening_balance         DECIMAL(15,2)  NOT NULL DEFAULT 0,
  closing_balance         DECIMAL(15,2),
  actual_closing_balance  DECIMAL(15,2),
  difference              DECIMAL(15,2),
  notes                   TEXT,
  status                  ENUM('open','closed') NOT NULL DEFAULT 'open',
  CONSTRAINT fk_cs_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cs_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE INDEX idx_cs_branch ON cash_sessions(branch_id);
CREATE INDEX idx_cs_user   ON cash_sessions(user_id);
CREATE INDEX idx_cs_status ON cash_sessions(status);

-- 5.2 Invoices (Hóa đơn)
CREATE TABLE IF NOT EXISTS invoices (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  invoice_code    VARCHAR(50)   NOT NULL UNIQUE,
  cash_session_id INT,
  customer_id     INT,
  user_id         INT           NOT NULL,
  branch_id       INT           NOT NULL,
  subtotal        DECIMAL(15,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  tax_amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_amount    DECIMAL(15,2) NOT NULL DEFAULT 0,
  paid_amount     DECIMAL(15,2) NOT NULL DEFAULT 0,
  change_amount   DECIMAL(15,2) NOT NULL DEFAULT 0,
  status          ENUM('active','refunded','cancelled') NOT NULL DEFAULT 'active',
  notes           TEXT,
  invoice_type    ENUM('pos','online','preorder') NOT NULL DEFAULT 'pos',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_inv_session  FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id) ON DELETE SET NULL,
  CONSTRAINT fk_inv_customer FOREIGN KEY (customer_id)     REFERENCES customers(id)      ON DELETE SET NULL,
  CONSTRAINT fk_inv_user     FOREIGN KEY (user_id)         REFERENCES users(id)          ON DELETE RESTRICT,
  CONSTRAINT fk_inv_branch   FOREIGN KEY (branch_id)       REFERENCES branches(id)       ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE INDEX idx_inv_code     ON invoices(invoice_code);
CREATE INDEX idx_inv_created  ON invoices(created_at);
CREATE INDEX idx_inv_user     ON invoices(user_id);
CREATE INDEX idx_inv_branch   ON invoices(branch_id);
CREATE INDEX idx_inv_customer ON invoices(customer_id);
CREATE INDEX idx_inv_status   ON invoices(status);

-- 5.3 Invoice Items
CREATE TABLE IF NOT EXISTS invoice_items (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id      INT            NOT NULL,
  product_id      INT            NOT NULL,
  variant_id      INT,
  unit_name       VARCHAR(50),
  quantity        DECIMAL(15,2)  NOT NULL,
  unit_price      DECIMAL(15,2)  NOT NULL,
  discount_amount DECIMAL(15,2)  NOT NULL DEFAULT 0,
  discount_percent DECIMAL(5,2)  NOT NULL DEFAULT 0,
  tax_amount      DECIMAL(15,2)  NOT NULL DEFAULT 0,
  total_amount    DECIMAL(15,2)  NOT NULL,
  cost_price      DECIMAL(15,2),
  created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ii_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  CONSTRAINT fk_ii_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ii_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_ii_invoice ON invoice_items(invoice_id);

-- 5.4 Invoice Payments
CREATE TABLE IF NOT EXISTS invoice_payments (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id     INT            NOT NULL,
  payment_method VARCHAR(50)    NOT NULL,
  amount         DECIMAL(15,2)  NOT NULL,
  reference_code VARCHAR(255),
  notes          TEXT,
  created_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ip_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_ip_invoice ON invoice_payments(invoice_id);

-- 5.5 Invoice Refunds (Đổi trả)
CREATE TABLE IF NOT EXISTS invoice_refunds (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id        INT            NOT NULL,
  refund_code       VARCHAR(50)    NOT NULL UNIQUE,
  reason            TEXT,
  total_refund_amount DECIMAL(15,2) NOT NULL,
  status            ENUM('draft','completed','cancelled') NOT NULL DEFAULT 'draft',
  created_by        INT,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ir_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ir_created FOREIGN KEY (created_by) REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_ir_invoice ON invoice_refunds(invoice_id);

-- 5.6 Invoice Refund Items
CREATE TABLE IF NOT EXISTS invoice_refund_items (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  refund_id       INT            NOT NULL,
  invoice_item_id INT            NOT NULL,
  product_id      INT            NOT NULL,
  quantity        DECIMAL(15,2)  NOT NULL,
  refund_amount   DECIMAL(15,2)  NOT NULL,
  reason          TEXT,
  CONSTRAINT fk_iri_refund     FOREIGN KEY (refund_id)       REFERENCES invoice_refunds(id) ON DELETE CASCADE,
  CONSTRAINT fk_iri_inv_item   FOREIGN KEY (invoice_item_id) REFERENCES invoice_items(id)    ON DELETE RESTRICT,
  CONSTRAINT fk_iri_product    FOREIGN KEY (product_id)      REFERENCES products(id)          ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE INDEX idx_iri_refund ON invoice_refund_items(refund_id);

-- ============================================================
-- 6. ORDER MANAGEMENT
-- ============================================================

-- 6.1 Orders (Đơn hàng Online)
CREATE TABLE IF NOT EXISTS orders (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  order_code        VARCHAR(50)   NOT NULL UNIQUE,
  customer_id       INT,
  channel           VARCHAR(50),
  channel_order_id  VARCHAR(100),
  branch_id         INT,
  subtotal          DECIMAL(15,2) NOT NULL DEFAULT 0,
  shipping_fee      DECIMAL(15,2) NOT NULL DEFAULT 0,
  discount_amount   DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
  payment_method    VARCHAR(50),
  payment_status    ENUM('unpaid','partial','paid') NOT NULL DEFAULT 'unpaid',
  status            ENUM('pending','confirmed','preparing','shipping','delivered','completed','cancelled','returned') NOT NULL DEFAULT 'pending',
  shipping_address  TEXT,
  shipping_provider VARCHAR(100),
  tracking_code     VARCHAR(100),
  notes             TEXT,
  created_by        INT,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ord_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_ord_branch   FOREIGN KEY (branch_id)   REFERENCES branches(id)   ON DELETE SET NULL,
  CONSTRAINT fk_ord_created  FOREIGN KEY (created_by)  REFERENCES users(id)      ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_ord_code     ON orders(order_code);
CREATE INDEX idx_ord_status   ON orders(status);
CREATE INDEX idx_ord_channel  ON orders(channel);
CREATE INDEX idx_ord_created  ON orders(created_at);
CREATE INDEX idx_ord_customer ON orders(customer_id);

-- 6.2 Order Items
CREATE TABLE IF NOT EXISTS order_items (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  order_id        INT            NOT NULL,
  product_id      INT            NOT NULL,
  variant_id      INT,
  quantity        INT            NOT NULL,
  unit_price      DECIMAL(15,2)  NOT NULL,
  discount_amount DECIMAL(15,2)  NOT NULL DEFAULT 0,
  total_amount    DECIMAL(15,2)  NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_oi_order   FOREIGN KEY (order_id)   REFERENCES orders(id)   ON DELETE CASCADE,
  CONSTRAINT fk_oi_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  CONSTRAINT fk_oi_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_oi_order ON order_items(order_id);

-- 6.3 Order Tracking
CREATE TABLE IF NOT EXISTS order_tracking (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  order_id   INT NOT NULL,
  status     VARCHAR(50) NOT NULL,
  note       TEXT,
  created_by INT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ot_order   FOREIGN KEY (order_id)   REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_ot_created FOREIGN KEY (created_by) REFERENCES users(id)  ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_ot_order ON order_tracking(order_id);

-- 6.4 Order Refunds
CREATE TABLE IF NOT EXISTS order_refunds (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  order_id          INT            NOT NULL,
  refund_code       VARCHAR(50)    NOT NULL UNIQUE,
  reason            TEXT,
  total_refund_amount DECIMAL(15,2) NOT NULL,
  status            ENUM('draft','completed','cancelled') NOT NULL DEFAULT 'draft',
  created_by        INT,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_or_order   FOREIGN KEY (order_id)   REFERENCES orders(id) ON DELETE RESTRICT,
  CONSTRAINT fk_or_created FOREIGN KEY (created_by) REFERENCES users(id)  ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_or_order ON order_refunds(order_id);

-- 6.5 Order Refund Items
CREATE TABLE IF NOT EXISTS order_refund_items (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  refund_id     INT            NOT NULL,
  order_item_id INT            NOT NULL,
  quantity      INT            NOT NULL,
  refund_amount DECIMAL(15,2)  NOT NULL,
  reason        TEXT,
  CONSTRAINT fk_ori_refund   FOREIGN KEY (refund_id)     REFERENCES order_refunds(id) ON DELETE CASCADE,
  CONSTRAINT fk_ori_ord_item FOREIGN KEY (order_item_id) REFERENCES order_items(id)   ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE INDEX idx_ori_refund ON order_refund_items(refund_id);

-- ============================================================
-- 7. SUPPLIER MANAGEMENT
-- ============================================================

-- 7.1 Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  code           VARCHAR(50)  NOT NULL UNIQUE,
  name           VARCHAR(255) NOT NULL,
  tax_code       VARCHAR(50),
  phone          VARCHAR(20),
  email          VARCHAR(255),
  address        TEXT,
  contact_person VARCHAR(255),
  payment_terms  VARCHAR(255),
  notes          TEXT,
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE INDEX idx_supplier_active ON suppliers(is_active);
CREATE INDEX idx_supplier_name   ON suppliers(name);

-- 7.2 Purchase Orders (Đơn nhập hàng)
CREATE TABLE IF NOT EXISTS purchase_orders (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  po_code       VARCHAR(50)   NOT NULL UNIQUE,
  supplier_id   INT           NOT NULL,
  branch_id     INT,
  warehouse_id  INT,
  subtotal      DECIMAL(15,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  tax_amount    DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_amount  DECIMAL(15,2) NOT NULL DEFAULT 0,
  status        ENUM('pending','partial','received','cancelled') NOT NULL DEFAULT 'pending',
  notes         TEXT,
  created_by    INT,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_po_supplier  FOREIGN KEY (supplier_id)  REFERENCES suppliers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_po_branch    FOREIGN KEY (branch_id)    REFERENCES branches(id)  ON DELETE SET NULL,
  CONSTRAINT fk_po_wh        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
  CONSTRAINT fk_po_created   FOREIGN KEY (created_by)   REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_po_supplier  ON purchase_orders(supplier_id);
CREATE INDEX idx_po_status    ON purchase_orders(status);
CREATE INDEX idx_po_created   ON purchase_orders(created_at);

-- 7.3 Purchase Order Items
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  po_id            INT            NOT NULL,
  product_id       INT            NOT NULL,
  variant_id       INT,
  quantity         INT            NOT NULL,
  received_quantity INT           NOT NULL DEFAULT 0,
  unit_cost        DECIMAL(15,2)  NOT NULL,
  discount_percent DECIMAL(5,2)   NOT NULL DEFAULT 0,
  total_amount     DECIMAL(15,2)  NOT NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_poi_po      FOREIGN KEY (po_id)      REFERENCES purchase_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_poi_product FOREIGN KEY (product_id)  REFERENCES products(id)        ON DELETE RESTRICT,
  CONSTRAINT fk_poi_variant FOREIGN KEY (variant_id)  REFERENCES product_variants(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_poi_po ON purchase_order_items(po_id);

-- 7.4 Supplier Payments
CREATE TABLE IF NOT EXISTS supplier_payments (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  supplier_id    INT            NOT NULL,
  po_id          INT,
  amount         DECIMAL(15,2)  NOT NULL,
  payment_date   DATE           NOT NULL,
  payment_method VARCHAR(50),
  reference_code VARCHAR(255),
  notes          TEXT,
  created_by     INT,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sp_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id)    ON DELETE RESTRICT,
  CONSTRAINT fk_sp_po       FOREIGN KEY (po_id)       REFERENCES purchase_orders(id) ON DELETE SET NULL,
  CONSTRAINT fk_sp_created  FOREIGN KEY (created_by)  REFERENCES users(id)        ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_sp_supplier ON supplier_payments(supplier_id);
CREATE INDEX idx_sp_po       ON supplier_payments(po_id);

-- 7.5 Supplier Debts (Công nợ phải trả)
CREATE TABLE IF NOT EXISTS supplier_debts (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  supplier_id      INT            NOT NULL,
  po_id            INT,
  total_amount     DECIMAL(15,2)  NOT NULL,
  paid_amount      DECIMAL(15,2)  NOT NULL DEFAULT 0,
  remaining_amount DECIMAL(15,2)  NOT NULL,
  due_date         DATE,
  status           ENUM('pending','partial','paid','overdue') NOT NULL DEFAULT 'pending',
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sd_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_sd_supplier ON supplier_debts(supplier_id);
CREATE INDEX idx_sd_status   ON supplier_debts(status);

-- ============================================================
-- 8. EMPLOYEE MANAGEMENT (NHÂN VIÊN)
-- ============================================================

-- 8.1 Shifts (Ca làm việc)
CREATE TABLE IF NOT EXISTS shifts (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  branch_id   INT,
  name        VARCHAR(100) NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  description TEXT,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_shift_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 8.2 Shift Assignments (Phân ca)
CREATE TABLE IF NOT EXISTS shift_assignments (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  shift_id   INT  NOT NULL,
  user_id    INT  NOT NULL,
  date       DATE NOT NULL,
  notes      TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sa_shift FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
  CONSTRAINT fk_sa_user  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
  UNIQUE KEY uq_shift_assignment (shift_id, user_id, date)
) ENGINE=InnoDB;
CREATE INDEX idx_sa_user ON shift_assignments(user_id);

-- 8.3 Attendance (Chấm công)
CREATE TABLE IF NOT EXISTS attendance (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  date       DATE NOT NULL,
  check_in   DATETIME,
  check_out  DATETIME,
  status     ENUM('present','late','early_leave','absent') NOT NULL DEFAULT 'present',
  notes      TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_att_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_attendance (user_id, date)
) ENGINE=InnoDB;
CREATE INDEX idx_att_user ON attendance(user_id);
CREATE INDEX idx_att_date ON attendance(date);

-- 8.4 Commission Rules
CREATE TABLE IF NOT EXISTS commission_rules (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  type         ENUM('percent_revenue','percent_profit','fixed_per_product') NOT NULL,
  value        DECIMAL(15,2) NOT NULL,
  product_id   INT,
  category_id  INT,
  min_revenue  DECIMAL(15,2),
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cr_product  FOREIGN KEY (product_id)  REFERENCES products(id)          ON DELETE SET NULL,
  CONSTRAINT fk_cr_category FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 8.5 Commissions (Hoa hồng)
CREATE TABLE IF NOT EXISTS commissions (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  user_id            INT            NOT NULL,
  invoice_id         INT,
  commission_rule_id INT,
  amount             DECIMAL(15,2)  NOT NULL,
  status             ENUM('pending','paid','cancelled') NOT NULL DEFAULT 'pending',
  paid_at            DATETIME,
  notes              TEXT,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_comm_user   FOREIGN KEY (user_id)            REFERENCES users(id)          ON DELETE RESTRICT,
  CONSTRAINT fk_comm_inv    FOREIGN KEY (invoice_id)         REFERENCES invoices(id)       ON DELETE SET NULL,
  CONSTRAINT fk_comm_rule   FOREIGN KEY (commission_rule_id) REFERENCES commission_rules(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE UNIQUE INDEX uq_commission_line ON commissions(user_id, invoice_id, commission_rule_id);
CREATE INDEX idx_comm_user   ON commissions(user_id);
CREATE INDEX idx_comm_status ON commissions(status);

-- ============================================================
-- 9. OMNI CHANNEL
-- ============================================================

-- 9.1 Channel Connections
CREATE TABLE IF NOT EXISTS channel_connections (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  channel_code    VARCHAR(50)  NOT NULL,
  channel_name    VARCHAR(255) NOT NULL,
  access_token    TEXT,
  refresh_token   TEXT,
  token_expires_at DATETIME,
  shop_id         VARCHAR(100),
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  last_sync_at    DATETIME,
  config          TEXT,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE INDEX idx_cc_channel ON channel_connections(channel_code);

-- 9.2 Channel-Product Mapping
CREATE TABLE IF NOT EXISTS channel_product_mapping (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  channel_id        INT  NOT NULL,
  product_id        INT  NOT NULL,
  variant_id        INT,
  channel_product_id VARCHAR(100),
  channel_sku       VARCHAR(100),
  channel_price     DECIMAL(15,2),
  channel_stock     INT,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  last_sync_at      DATETIME,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cpm_channel FOREIGN KEY (channel_id) REFERENCES channel_connections(id) ON DELETE CASCADE,
  CONSTRAINT fk_cpm_product FOREIGN KEY (product_id) REFERENCES products(id)            ON DELETE CASCADE,
  CONSTRAINT fk_cpm_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id)    ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_cpm_channel ON channel_product_mapping(channel_id);

-- 9.3 Order-Channel Mapping
CREATE TABLE IF NOT EXISTS order_channel_mapping (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  order_id         INT  NOT NULL,
  channel_id       INT  NOT NULL,
  channel_order_id VARCHAR(100),
  channel_order_data TEXT,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ocm_order   FOREIGN KEY (order_id)   REFERENCES orders(id)             ON DELETE CASCADE,
  CONSTRAINT fk_ocm_channel FOREIGN KEY (channel_id) REFERENCES channel_connections(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_ocm_order   ON order_channel_mapping(order_id);
CREATE INDEX idx_ocm_channel ON order_channel_mapping(channel_id);

-- 9.4 Sync Logs
CREATE TABLE IF NOT EXISTS sync_logs (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  channel_id INT,
  sync_type  VARCHAR(50) NOT NULL,
  direction  ENUM('push','pull') NOT NULL,
  status     ENUM('success','failed','partial') NOT NULL,
  message    TEXT,
  details    TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sl_channel FOREIGN KEY (channel_id) REFERENCES channel_connections(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_sl_channel ON sync_logs(channel_id);
CREATE INDEX idx_sl_status  ON sync_logs(status);
CREATE INDEX idx_sl_created ON sync_logs(created_at);

-- ============================================================
-- 10. ACCOUNTING & FINANCE
-- ============================================================

-- 10.1 Cash Funds (Quỹ tiền mặt)
CREATE TABLE IF NOT EXISTS cash_funds (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  branch_id  INT,
  name       VARCHAR(255) NOT NULL,
  code       VARCHAR(50)  NOT NULL UNIQUE,
  balance    DECIMAL(15,2) NOT NULL DEFAULT 0,
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cf_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 10.2 Fund Transactions (Biến động quỹ)
CREATE TABLE IF NOT EXISTS fund_transactions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  fund_id         INT            NOT NULL,
  type            ENUM('in','out') NOT NULL,
  amount          DECIMAL(15,2)  NOT NULL,
  balance_before  DECIMAL(15,2)  NOT NULL,
  balance_after   DECIMAL(15,2)  NOT NULL,
  reference_type  VARCHAR(50),
  reference_id    INT,
  description     TEXT,
  created_by      INT,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ft_fund    FOREIGN KEY (fund_id)    REFERENCES cash_funds(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ft_created FOREIGN KEY (created_by) REFERENCES users(id)      ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_ft_fund   ON fund_transactions(fund_id);
CREATE INDEX idx_ft_created ON fund_transactions(created_at);

-- 10.3 Revenue/Expense Categories (Danh mục thu chi)
CREATE TABLE IF NOT EXISTS revenue_expense_categories (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  parent_id  INT,
  name       VARCHAR(255) NOT NULL,
  code       VARCHAR(50)  NOT NULL UNIQUE,
  type       ENUM('revenue','expense','both') NOT NULL DEFAULT 'both',
  sort_order INT NOT NULL DEFAULT 0,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rec_parent FOREIGN KEY (parent_id) REFERENCES revenue_expense_categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_rec_parent ON revenue_expense_categories(parent_id);

-- 10.4 Revenue/Expense Records (Sổ thu chi)
CREATE TABLE IF NOT EXISTS revenue_expense_records (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  branch_id    INT,
  category_id  INT            NOT NULL,
  fund_id      INT,
  amount       DECIMAL(15,2)  NOT NULL,
  date         DATE           NOT NULL,
  description  TEXT,
  reference_type VARCHAR(50),
  reference_id   INT,
  created_by   INT,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rer_branch   FOREIGN KEY (branch_id)   REFERENCES branches(id)                ON DELETE SET NULL,
  CONSTRAINT fk_rer_category FOREIGN KEY (category_id) REFERENCES revenue_expense_categories(id) ON DELETE RESTRICT,
  CONSTRAINT fk_rer_fund     FOREIGN KEY (fund_id)     REFERENCES cash_funds(id)              ON DELETE SET NULL,
  CONSTRAINT fk_rer_created  FOREIGN KEY (created_by)  REFERENCES users(id)                   ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_rer_branch   ON revenue_expense_records(branch_id);
CREATE INDEX idx_rer_category ON revenue_expense_records(category_id);
CREATE INDEX idx_rer_date     ON revenue_expense_records(date);

-- ============================================================
-- 11. MARKETING & PROMOTIONS
-- ============================================================

-- 11.1 Coupons (Mã giảm giá)
CREATE TABLE IF NOT EXISTS coupons (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  code                VARCHAR(100)  NOT NULL UNIQUE,
  name                VARCHAR(255)  NOT NULL,
  type                ENUM('percent','fixed','free_shipping') NOT NULL,
  value               DECIMAL(15,2) NOT NULL,
  min_order_amount    DECIMAL(15,2),
  max_discount        DECIMAL(15,2),
  usage_limit         INT,
  usage_per_customer  INT,
  used_count          INT NOT NULL DEFAULT 0,
  start_date          DATETIME,
  end_date            DATETIME,
  applicable_channels VARCHAR(255),
  is_active           TINYINT(1)    NOT NULL DEFAULT 1,
  created_by          INT,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_coupon_created FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_coupon_code    ON coupons(code);
CREATE INDEX idx_coupon_active  ON coupons(is_active);
CREATE INDEX idx_coupon_dates   ON coupons(start_date, end_date);

-- 11.2 Coupon Conditions
CREATE TABLE IF NOT EXISTS coupon_conditions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  coupon_id       INT         NOT NULL,
  condition_type  VARCHAR(50) NOT NULL,
  condition_value TEXT        NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cc_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_cc_coupon ON coupon_conditions(coupon_id);

-- 11.3 Coupon Usage
CREATE TABLE IF NOT EXISTS coupon_usage (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  coupon_id       INT            NOT NULL,
  invoice_id      INT,
  customer_id     INT,
  discount_amount DECIMAL(15,2)  NOT NULL,
  used_at         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cu_coupon   FOREIGN KEY (coupon_id)   REFERENCES coupons(id)   ON DELETE RESTRICT,
  CONSTRAINT fk_cu_invoice  FOREIGN KEY (invoice_id)  REFERENCES invoices(id)  ON DELETE SET NULL,
  CONSTRAINT fk_cu_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_cu_coupon   ON coupon_usage(coupon_id);

-- 11.4 Vouchers
CREATE TABLE IF NOT EXISTS vouchers (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  coupon_id   INT,
  customer_id INT,
  code        VARCHAR(100) NOT NULL UNIQUE,
  status      ENUM('active','used','expired','cancelled') NOT NULL DEFAULT 'active',
  issued_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at     DATETIME,
  expired_at  DATETIME,
  CONSTRAINT fk_v_coupon   FOREIGN KEY (coupon_id)   REFERENCES coupons(id)   ON DELETE SET NULL,
  CONSTRAINT fk_v_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_v_code     ON vouchers(code);
CREATE INDEX idx_v_status   ON vouchers(status);
CREATE INDEX idx_v_customer ON vouchers(customer_id);

-- 11.5 Flash Sales
CREATE TABLE IF NOT EXISTS flash_sales (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  start_time  DATETIME NOT NULL,
  end_time    DATETIME NOT NULL,
  description TEXT,
  status      ENUM('scheduled','active','ended','cancelled') NOT NULL DEFAULT 'scheduled',
  created_by  INT,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_fs_created FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_fs_status ON flash_sales(status);
CREATE INDEX idx_fs_times  ON flash_sales(start_time, end_time);

-- 11.6 Flash Sale Products
CREATE TABLE IF NOT EXISTS flash_sale_products (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  flash_sale_id       INT            NOT NULL,
  product_id          INT            NOT NULL,
  variant_id          INT,
  flash_price         DECIMAL(15,2)  NOT NULL,
  quantity_limit      INT            NOT NULL DEFAULT 0,
  sold_quantity       INT            NOT NULL DEFAULT 0,
  per_customer_limit  INT            NOT NULL DEFAULT 0,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fsp_sale    FOREIGN KEY (flash_sale_id) REFERENCES flash_sales(id) ON DELETE CASCADE,
  CONSTRAINT fk_fsp_product FOREIGN KEY (product_id)    REFERENCES products(id)     ON DELETE RESTRICT,
  CONSTRAINT fk_fsp_variant FOREIGN KEY (variant_id)    REFERENCES product_variants(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_fsp_sale ON flash_sale_products(flash_sale_id);

-- 11.7 Promotion: Buy X Get Y
CREATE TABLE IF NOT EXISTS promotion_buy_x_get_y (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  name                VARCHAR(255) NOT NULL,
  buy_product_id      INT,
  buy_category_id     INT,
  buy_quantity        INT NOT NULL DEFAULT 1,
  get_product_id      INT,
  get_category_id     INT,
  get_quantity        INT NOT NULL DEFAULT 1,
  get_discount_percent DECIMAL(5,2) NOT NULL DEFAULT 100,
  start_date          DATETIME NOT NULL,
  end_date            DATETIME NOT NULL,
  is_active           TINYINT(1) NOT NULL DEFAULT 1,
  created_by          INT,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bxy_buy_prod   FOREIGN KEY (buy_product_id)  REFERENCES products(id)          ON DELETE SET NULL,
  CONSTRAINT fk_bxy_buy_cat    FOREIGN KEY (buy_category_id) REFERENCES product_categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_bxy_get_prod   FOREIGN KEY (get_product_id)  REFERENCES products(id)          ON DELETE SET NULL,
  CONSTRAINT fk_bxy_get_cat    FOREIGN KEY (get_category_id) REFERENCES product_categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_bxy_created    FOREIGN KEY (created_by)      REFERENCES users(id)             ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_bxy_active ON promotion_buy_x_get_y(is_active);
CREATE INDEX idx_bxy_dates  ON promotion_buy_x_get_y(start_date, end_date);

-- 11.8 Promotion Combos (Combo khuyến mãi)
CREATE TABLE IF NOT EXISTS promotion_combos (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(255)  NOT NULL,
  combo_price    DECIMAL(15,2) NOT NULL,
  original_price DECIMAL(15,2) NOT NULL,
  start_date     DATETIME,
  end_date       DATETIME,
  quantity_limit INT NOT NULL DEFAULT 0,
  sold_count     INT NOT NULL DEFAULT 0,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  created_by     INT,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pc_created FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_pc_active ON promotion_combos(is_active);

-- 11.9 Promotion Combo Items
CREATE TABLE IF NOT EXISTS promotion_combo_items (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  combo_id   INT NOT NULL,
  product_id INT NOT NULL,
  quantity   INT NOT NULL DEFAULT 1,
  CONSTRAINT fk_pci_combo_p   FOREIGN KEY (combo_id)   REFERENCES promotion_combos(id) ON DELETE CASCADE,
  CONSTRAINT fk_pci_product_p FOREIGN KEY (product_id) REFERENCES products(id)          ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE INDEX idx_pci_combo_p ON promotion_combo_items(combo_id);

-- ============================================================
-- 12. SYSTEM CONFIGURATION
-- ============================================================

-- 12.1 Store Configuration
CREATE TABLE IF NOT EXISTS store_config (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  config_key  VARCHAR(100) NOT NULL UNIQUE,
  config_value TEXT,
  group_name  VARCHAR(100),
  description TEXT,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE INDEX idx_sc_group ON store_config(group_name);

-- 12.2 Notification Templates
CREATE TABLE IF NOT EXISTS notification_templates (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  template_code VARCHAR(100) NOT NULL UNIQUE,
  template_name VARCHAR(255) NOT NULL,
  channel       VARCHAR(50)  NOT NULL,
  subject       VARCHAR(500),
  content       TEXT NOT NULL,
  variables     TEXT,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE INDEX idx_nt_channel ON notification_templates(channel);

-- ============================================================
-- SEED DATA
-- ============================================================

-- Default roles
INSERT INTO roles (name, code, description, is_system) VALUES
('Admin', 'admin', 'Chủ cửa hàng - Toàn quyền', 1),
('Manager', 'manager', 'Quản lý vận hành', 1),
('Seller', 'seller', 'Nhân viên bán hàng', 1),
('Warehouse', 'warehouse', 'Nhân viên kho', 1),
('Viewer', 'viewer', 'Chế độ xem', 1);

-- Default permissions (module-based)
INSERT INTO permissions (module, action, name, code) VALUES
('pos', 'create_invoice', 'Tạo hóa đơn', 'pos.create_invoice'),
('pos', 'read_invoice', 'Xem hóa đơn', 'pos.read_invoice'),
('pos', 'cancel_invoice', 'Hủy hóa đơn', 'pos.cancel_invoice'),
('pos', 'refund_invoice', 'Đổi trả hóa đơn', 'pos.refund_invoice'),
('pos', 'manage_session', 'Quản lý ca', 'pos.manage_session'),

('product', 'create', 'Thêm sản phẩm', 'product.create'),
('product', 'read', 'Xem sản phẩm', 'product.read'),
('product', 'update', 'Sửa sản phẩm', 'product.update'),
('product', 'delete', 'Xóa sản phẩm', 'product.delete'),
('product', 'manage_category', 'Quản lý danh mục', 'product.manage_category'),
('product', 'import_export', 'Import/Export sản phẩm', 'product.import_export'),

('warehouse', 'create_transaction', 'Tạo phiếu nhập/xuất', 'warehouse.create_transaction'),
('warehouse', 'read_inventory', 'Xem tồn kho', 'warehouse.read_inventory'),
('warehouse', 'stock_take', 'Kiểm kê kho', 'warehouse.stock_take'),
('warehouse', 'transfer', 'Chuyển kho', 'warehouse.transfer'),

('crm', 'create', 'Thêm khách hàng', 'crm.create'),
('crm', 'read', 'Xem khách hàng', 'crm.read'),
('crm', 'update', 'Sửa khách hàng', 'crm.update'),
('crm', 'manage_points', 'Quản lý điểm thưởng', 'crm.manage_points'),
('crm', 'manage_debt', 'Quản lý công nợ', 'crm.manage_debt'),

('order', 'read', 'Xem đơn hàng', 'order.read'),
('order', 'update_status', 'Cập nhật trạng thái', 'order.update_status'),
('order', 'manage_return', 'Quản lý đổi trả', 'order.manage_return'),

('staff', 'read', 'Xem nhân viên', 'staff.read'),
('staff', 'create', 'Thêm nhân viên', 'staff.create'),
('staff', 'update', 'Sửa nhân viên', 'staff.update'),
('staff', 'delete', 'Xóa nhân viên', 'staff.delete'),
('staff', 'manage_shift', 'Quản lý ca làm việc', 'staff.manage_shift'),
('staff', 'manage_attendance', 'Quản lý chấm công', 'staff.manage_attendance'),
('staff', 'manage_commission', 'Quản lý hoa hồng', 'staff.manage_commission'),
('staff', 'view_audit_log', 'Xem audit log', 'staff.view_audit_log'),

('report', 'view_dashboard', 'Xem dashboard', 'report.view_dashboard'),
('report', 'view_revenue', 'Xem báo cáo doanh thu', 'report.view_revenue'),
('report', 'view_profit', 'Xem báo cáo lợi nhuận', 'report.view_profit'),
('report', 'view_inventory', 'Xem báo cáo tồn kho', 'report.view_inventory'),
('report', 'export', 'Xuất báo cáo', 'report.export'),

('supplier', 'create', 'Thêm nhà cung cấp', 'supplier.create'),
('supplier', 'read', 'Xem nhà cung cấp', 'supplier.read'),
('supplier', 'update', 'Sửa nhà cung cấp', 'supplier.update'),
('supplier', 'manage_po', 'Quản lý đơn nhập', 'supplier.manage_po'),

('omni', 'manage_connection', 'Quản lý kết nối kênh', 'omni.manage_connection'),
('omni', 'manage_product_sync', 'Đồng bộ sản phẩm', 'omni.manage_product_sync'),
('omni', 'manage_order_sync', 'Đồng bộ đơn hàng', 'omni.manage_order_sync'),

('marketing', 'manage_coupon', 'Quản lý mã giảm giá', 'marketing.manage_coupon'),
('marketing', 'manage_flash_sale', 'Quản lý flash sale', 'marketing.manage_flash_sale'),
('marketing', 'manage_promotion', 'Quản lý khuyến mãi', 'marketing.manage_promotion'),

('accounting', 'manage_fund', 'Quản lý quỹ', 'accounting.manage_fund'),
('accounting', 'manage_revenue_expense', 'Quản lý thu chi', 'accounting.manage_revenue_expense'),
('accounting', 'manage_debt', 'Quản lý công nợ', 'accounting.manage_debt'),

('config', 'read', 'Xem cấu hình', 'config.read'),
('config', 'update', 'Cập nhật cấu hình', 'config.update'),
('config', 'manage_role', 'Quản lý vai trò', 'config.manage_role');

-- Assign all permissions to Admin role (role_id = 1)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions;

-- Default customer groups
INSERT INTO customer_groups (name, code, description, discount_percent, is_default) VALUES
('Khách lẻ', 'retail', 'Khách hàng mua lẻ', 0, 1),
('Khách buôn', 'wholesale', 'Khách hàng mua buôn', 5, 0),
('Khách VIP', 'vip', 'Khách hàng thân thiết', 10, 0);

-- Default inventory transaction types
INSERT INTO inventory_transaction_types (code, name, direction) VALUES
('purchase_receipt', 'Nhập kho từ đơn nhập hàng', 'in'),
('sales_issue', 'Xuất kho cho hóa đơn bán', 'out'),
('transfer_out', 'Chuyển kho đi', 'out'),
('transfer_in', 'Nhận chuyển kho đến', 'in'),
('adjustment_in', 'Điều chỉnh tăng', 'in'),
('adjustment_out', 'Điều chỉnh giảm', 'out'),
('return_in', 'Nhập kho hàng trả lại', 'in'),
('return_out', 'Xuất kho trả nhà cung cấp', 'out'),
('stock_take', 'Kiểm kê kho', 'out');

-- Default store config
INSERT INTO store_config (config_key, config_value, group_name, description) VALUES
('store_name', 'Cửa hàng của tôi', 'general', 'Tên cửa hàng'),
('store_address', '', 'general', 'Địa chỉ cửa hàng'),
('store_phone', '', 'general', 'Số điện thoại'),
('store_email', '', 'general', 'Email'),
('tax_rate', '10', 'tax', 'Thuế suất VAT mặc định (%)'),
('currency', 'VND', 'general', 'Đơn vị tiền tệ'),
('loyalty_rate', '1', 'loyalty', 'Số điểm tích lũy trên 1.000đ'),
('loyalty_convert_rate', '1000', 'loyalty', 'Giá trị quy đổi 1 điểm (VNĐ)'),
('min_stock_alert', '10', 'inventory', 'Ngưỡng cảnh báo tồn kho tối thiểu (mặc định)'),
('invoice_prefix', 'HD', 'pos', 'Tiền tố mã hóa đơn'),
('pos_two_screen', '0', 'pos', 'Bật chế độ POS 2 màn hình'),
('receipt_printer', '', 'pos', 'Máy in hóa đơn mặc định'),
('notification_stock_alert', '1', 'notification', 'Bật cảnh báo tồn kho'),
('notification_expiry_alert_30', '1', 'notification', 'Cảnh báo HSD 30 ngày'),
('notification_expiry_alert_14', '1', 'notification', 'Cảnh báo HSD 14 ngày'),
('notification_expiry_alert_7', '1', 'notification', 'Cảnh báo HSD 7 ngày'),
('notification_debt_alert', '1', 'notification', 'Cảnh báo công nợ quá hạn');

-- Default revenue/expense categories
INSERT INTO revenue_expense_categories (name, code, type, sort_order) VALUES
('Doanh thu bán hàng', 'revenue_sales', 'revenue', 1),
('Doanh thu khác', 'revenue_other', 'revenue', 2),
('Tiền nhập hàng', 'expense_purchase', 'expense', 3),
('Tiền thuê mặt bằng', 'expense_rent', 'expense', 4),
('Tiền điện', 'expense_electricity', 'expense', 5),
('Tiền nước', 'expense_water', 'expense', 6),
('Lương nhân viên', 'expense_salary', 'expense', 7),
('Chi phí vận chuyển', 'expense_shipping', 'expense', 8),
('Chi phí marketing', 'expense_marketing', 'expense', 9),
('Chi phí khác', 'expense_other', 'expense', 10);

-- Default product categories
INSERT INTO product_categories (name, slug, sort_order) VALUES
('Thời trang', 'thoi-trang', 1),
('Điện tử', 'dien-tu', 2),
('Thực phẩm', 'thuc-pham', 3),
('Đồ uống', 'do-uong', 4),
('Mỹ phẩm', 'my-pham', 5),
('Đồ gia dụng', 'do-gia-dung', 6),
('Sách văn phòng phẩm', 'sach-van-phong-pham', 7),
('Khác', 'khac', 8);

-- Default notification templates
INSERT INTO notification_templates (template_code, template_name, channel, subject, content, variables) VALUES
('invoice_email', 'Hóa đơn điện tử', 'email', 'Hóa đơn điện tử từ {{store_name}}', 'Cảm ơn {{customer_name}} đã mua hàng tại {{store_name}}. Mã hóa đơn: {{invoice_code}}, tổng tiền: {{total_amount}}', 'store_name,customer_name,invoice_code,total_amount'),
('debt_reminder_sms', 'Nhắc nợ SMS', 'sms', '', 'Khách hàng {{customer_name}} thân mến, bạn còn {{remaining_amount}}đ chưa thanh toán. Vui lòng thanh toán trước {{due_date}}.', 'customer_name,remaining_amount,due_date'),
('welcome_sms', 'Chào mừng khách mới', 'sms', '', 'Chào mừng {{customer_name}} đến với {{store_name}}. Cảm ơn bạn đã tin tưởng!', 'customer_name,store_name');
