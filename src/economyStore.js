const db = require('./db');

const CATEGORIES = [
  'ɢᴀᴍɪɴɢ','ᴅɪɢɪᴛᴀʟ ɪᴛᴇᴍs','ᴘʀᴇᴍɪᴜᴍ','ᴘᴏɪɴᴛ ʙᴏᴏsᴛs','xᴘ ʙᴏᴏsᴛs','ᴛᴏᴜʀɴᴀᴍᴇɴᴛs','ᴛɪᴄᴋᴇᴛs','ᴍʏsᴛᴇʀʏ ᴄʀᴀᴛᴇs','ᴄᴏsᴍᴇᴛɪᴄs','ᴘʀᴏғɪʟᴇ ʙᴀᴅɢᴇs',
  'ᴘʀᴏғɪʟᴇ ғʀᴀᴍᴇs','ᴡɪɴ ᴇғғᴇᴄᴛs','ɴᴀᴍᴇ sᴛʏʟᴇs','ᴄʟᴀɴ ɪᴛᴇᴍs','ᴄʟᴀɴ ʙᴏᴏsᴛs','ʀᴀɴᴋᴇᴅ ʙᴏᴏsᴛs','ᴇᴠᴇɴᴛ ᴛɪᴄᴋᴇᴛs','ᴅᴀɪʟʏ ʀᴇᴡᴀʀᴅs','sᴛʀᴇᴀᴋ ʙᴏᴏsᴛs','ʟᴜᴄᴋ ʙᴏᴏsᴛs',
  'sʜɪᴇʟᴅs','sᴄᴀɴs','ʙᴏᴍʙ ᴀʀᴇɴᴀ','sɴɪᴘᴇʀ ᴅᴜᴇʟ','ᴄʜᴇss','ᴛɪᴄ-ᴛᴀᴄ-ᴛᴏᴇ','ʀᴘs','ǫᴜɪᴢ','ᴡᴏʀᴅ ɢᴀᴍᴇs','ᴍᴇᴍᴏʀʏ',
  'ʟᴇᴀɢᴜᴇ','ᴡᴏʀʟᴅ ᴄᴜᴘ','ᴄʟᴀɴ ᴡᴀʀs','ʙᴏᴜɴᴛʏ','ʙᴀᴛᴛʟᴇ ᴘᴀss','sᴇᴀsᴏɴ ʀᴇᴡᴀʀᴅs','ᴊᴀᴄᴋᴘᴏᴛ','ʟᴏᴛᴛᴇʀʏ','ʀᴇᴅᴇᴇᴍ ᴄᴏᴅᴇs','ɢɪғᴛ ᴄᴀʀᴅs',
  'ᴍᴏʙɪʟᴇ ᴅᴀᴛᴀ','ᴀɪ ᴛᴏᴏʟs','ᴅᴇᴠ ᴛᴏᴏʟs','ᴅɪɢɪᴛᴀʟ ᴅᴏᴡɴʟᴏᴀᴅs','ᴇʙᴏᴏᴋs','ᴍᴜsɪᴄ & ᴀᴜᴅɪᴏ','ᴠɪᴅᴇᴏ & ᴍᴇᴅɪᴀ','ᴄᴏᴜʀsᴇs','ᴍᴇᴍʙᴇʀsʜɪᴘs','ᴠɪᴘ ᴄʀᴇᴡ'
];

function init() {
  db.db.exec(`
    CREATE TABLE IF NOT EXISTS bank_accounts (
      user_id INTEGER PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bank_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      reference TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS point_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS point_withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      processed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS store_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS store_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price INTEGER NOT NULL,
      stock INTEGER NOT NULL DEFAULT -1,
      active INTEGER NOT NULL DEFAULT 1,
      fulfillment_type TEXT,
      fulfillment_file_id TEXT,
      fulfillment_file_name TEXT,
      fulfillment_caption TEXT,
      FOREIGN KEY(category_id) REFERENCES store_categories(id)
    );
    CREATE TABLE IF NOT EXISTS player_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL, product_id INTEGER NOT NULL, quantity INTEGER NOT NULL DEFAULT 1,
      UNIQUE(user_id, product_id), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS store_cart (
      user_id INTEGER NOT NULL, product_id INTEGER NOT NULL, quantity INTEGER NOT NULL DEFAULT 1,
      UNIQUE(user_id, product_id)
    );
    CREATE TABLE IF NOT EXISTS item_gifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id INTEGER NOT NULL, receiver_id INTEGER NOT NULL, product_id INTEGER NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS item_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id INTEGER NOT NULL, receiver_id INTEGER NOT NULL, offer_product_id INTEGER NOT NULL, offer_qty INTEGER NOT NULL, request_product_id INTEGER NOT NULL, request_qty INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS store_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, sale_percent INTEGER NOT NULL DEFAULT 0, featured INTEGER NOT NULL DEFAULT 0, flash_until TEXT, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS economy_daily (
      user_id INTEGER PRIMARY KEY, claimed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS store_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      total INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS store_license_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      license_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'available',
      order_id INTEGER,
      user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      claimed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS store_ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), review TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, product_id)
    );
    CREATE TABLE IF NOT EXISTS store_discount_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, percent INTEGER NOT NULL CHECK(percent BETWEEN 1 AND 100),
      max_uses INTEGER NOT NULL DEFAULT -1, used_count INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT
    );
    CREATE TABLE IF NOT EXISTS store_gifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, sender_id INTEGER NOT NULL, receiver_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // Safe migrations for databases created by older RUSH versions.
  const productCols = db.db.prepare('PRAGMA table_info(store_products)').all().map(x => x.name);
  const addCol = (name, sql) => { if (!productCols.includes(name)) db.db.exec(sql); };
  addCol('fulfillment_type', 'ALTER TABLE store_products ADD COLUMN fulfillment_type TEXT');
  addCol('fulfillment_file_id', 'ALTER TABLE store_products ADD COLUMN fulfillment_file_id TEXT');
  addCol('fulfillment_file_name', 'ALTER TABLE store_products ADD COLUMN fulfillment_file_name TEXT');
  addCol('fulfillment_caption', 'ALTER TABLE store_products ADD COLUMN fulfillment_caption TEXT');

  const insertCat = db.db.prepare('INSERT OR IGNORE INTO store_categories (name) VALUES (?)');
  const tx = db.db.transaction(() => CATEGORIES.forEach(c => insertCat.run(c)));
  tx();
  const count = db.db.prepare('SELECT COUNT(*) AS n FROM store_products').get().n;
  if (!count) seedProducts();
}

function seedProducts() {
  const cats = db.db.prepare('SELECT id,name FROM store_categories ORDER BY id').all();
  const insert = db.db.prepare('INSERT INTO store_products (category_id,name,description,price,stock) VALUES (?,?,?,?,?)');
  const tx = db.db.transaction(() => {
    cats.forEach((c, i) => {
      const base = 25 + (i % 8) * 25;
      insert.run(c.id, `ᴄᴏᴍᴍᴏɴ ${c.name}`, `ʀᴜsʜ ${c.name} item`, base, -1);
      insert.run(c.id, `ᴇᴘɪᴄ ${c.name}`, `ᴇᴘɪᴄ ʀᴜsʜ ${c.name} reward`, base * 4, -1);
      insert.run(c.id, `ʟᴇɢᴇɴᴅᴀʀʏ ${c.name}`, `ʀᴀʀᴇ ʟᴇɢᴇɴᴅᴀʀʏ ${c.name} reward`, base * 10, -1);
    });
  });
  tx();
}

function ensureBank(userId) {
  db.db.prepare('INSERT OR IGNORE INTO bank_accounts (user_id) VALUES (?)').run(userId);
  return db.db.prepare('SELECT * FROM bank_accounts WHERE user_id=?').get(userId);
}
function bank(userId) { return ensureBank(userId); }
function deposit(userId, amount) {
  const value = Math.trunc(Number(amount)); if (!Number.isFinite(value) || value <= 0) return {ok:false,reason:'amount'};
  return db.db.transaction(() => {
    const u=db.getUser(userId); if(!u || u.points<value) return {ok:false,reason:'points'};
    const b=ensureBank(userId); db.db.prepare('UPDATE users SET points=points-? WHERE user_id=?').run(value,userId);
    const next=b.balance+value; db.db.prepare("UPDATE bank_accounts SET balance=?,updated_at=datetime('now') WHERE user_id=?").run(next,userId);
    db.db.prepare('INSERT INTO point_transactions (user_id,amount,reason,reference) VALUES (?,?,?,?)').run(userId,-value,'bank_deposit',String(next));
    db.db.prepare('INSERT INTO bank_transactions (user_id,type,amount,balance_after,reference) VALUES (?,?,?,?,?)').run(userId,'deposit',value,next,null);
    return {ok:true,balance:next,user:db.getUser(userId)};
  })();
}
function withdrawBank(userId, amount) {
  const value=Math.trunc(Number(amount)); if(!Number.isFinite(value)||value<=0)return {ok:false,reason:'amount'};
  return db.db.transaction(()=>{const b=ensureBank(userId);if(b.balance<value)return {ok:false,reason:'bank'};db.db.prepare('UPDATE bank_accounts SET balance=balance-?,updated_at=datetime(\'now\') WHERE user_id=?').run(value,userId);db.db.prepare('UPDATE users SET points=points+? WHERE user_id=?').run(value,userId);const next=b.balance-value;db.db.prepare('INSERT INTO point_transactions (user_id,amount,reason,reference) VALUES (?,?,?,?)').run(userId,value,'bank_withdraw',String(next));db.db.prepare('INSERT INTO bank_transactions (user_id,type,amount,balance_after,reference) VALUES (?,?,?,?,?)').run(userId,'withdraw',value,next,null);return {ok:true,balance:next,user:db.getUser(userId)};})();
}
function transfer(senderId, targetId, amount) {
  const value=Math.trunc(Number(amount)); if(!Number.isFinite(value)||value<=0)return {ok:false,reason:'amount'};
  if(senderId===targetId)return {ok:false,reason:'self'};
  return db.db.transaction(()=>{const s=db.getUser(senderId),r=db.getUser(targetId);if(!s||!r)return {ok:false,reason:'user'};if(s.points<value)return {ok:false,reason:'points'};db.db.prepare('UPDATE users SET points=points-? WHERE user_id=?').run(value,senderId);db.db.prepare('UPDATE users SET points=points+? WHERE user_id=?').run(value,targetId);db.db.prepare('INSERT INTO point_transactions (user_id,amount,reason,reference) VALUES (?,?,?,?)').run(senderId,-value,'transfer_sent',String(targetId));db.db.prepare('INSERT INTO point_transactions (user_id,amount,reason,reference) VALUES (?,?,?,?)').run(targetId,value,'transfer_received',String(senderId));db.db.prepare('INSERT INTO point_transfers (sender_id,receiver_id,amount) VALUES (?,?,?)').run(senderId,targetId,value);return {ok:true,amount:value,sender:db.getUser(senderId),receiver:db.getUser(targetId)};})();
}
function requestWithdrawal(userId, amount, note='') {
  const value=Math.trunc(Number(amount)); if(!Number.isFinite(value)||value<=0)return {ok:false,reason:'amount'};
  return db.db.transaction(()=>{const b=ensureBank(userId);if(b.balance<value)return {ok:false,reason:'bank'};db.db.prepare('UPDATE bank_accounts SET balance=balance-?,updated_at=datetime(\'now\') WHERE user_id=?').run(value,userId);db.db.prepare('INSERT INTO bank_transactions (user_id,type,amount,balance_after,reference) VALUES (?,?,?,?,?)').run(userId,'withdrawal_request',value,b.balance-value,note||null);const info=db.db.prepare('INSERT INTO point_withdrawals (user_id,amount,note) VALUES (?,?,?)').run(userId,value,note||null);return {ok:true,id:info.lastInsertRowid,balance:b.balance-value};})();
}
function listWithdrawals(limit=50){return db.db.prepare('SELECT w.*,u.username FROM point_withdrawals w LEFT JOIN users u ON u.user_id=w.user_id ORDER BY w.id DESC LIMIT ?').all(Math.max(1,Number(limit)||50));}
function getCategories(){return db.db.prepare('SELECT * FROM store_categories WHERE active=1 ORDER BY id').all();}
function getProducts(categoryId){return db.db.prepare('SELECT * FROM store_products WHERE category_id=? AND active=1 ORDER BY price,id').all(categoryId);}
function getProduct(productId){return db.db.prepare('SELECT p.*,c.name AS category_name FROM store_products p LEFT JOIN store_categories c ON c.id=p.category_id WHERE p.id=?').get(productId);}
function createDigitalProduct({categoryId,name,description='',price,stock=-1,fulfillmentType='document',fileId,fileName='',caption=''}){
  const n=String(name||'').trim(); const v=Math.trunc(Number(price));
  if(!n || !Number.isFinite(v) || v<0 || !categoryId || !fileId || (fulfillmentType==='license' && !String(fileId).trim())) return {ok:false,reason:'invalid'};
  const category=db.db.prepare('SELECT id FROM store_categories WHERE id=? AND active=1').get(categoryId);
  if(!category) return {ok:false,reason:'category'};
  const info=db.db.prepare(`INSERT INTO store_products (category_id,name,description,price,stock,active,fulfillment_type,fulfillment_file_id,fulfillment_file_name,fulfillment_caption) VALUES (?,?,?,?,?,1,?,?,?,?)`).run(categoryId,n,String(description||''),v,Math.trunc(Number(stock) || -1),fulfillmentType,String(fileId),String(fileName||''),String(caption||''));
  return {ok:true,product:getProduct(info.lastInsertRowid)};
}
function fulfillProduct(userId, productId, orderId=null){
  const p=getProduct(productId); if(!p) return null;
  if(p.fulfillment_type==='license'){ const key=claimLicenseKey(productId,userId,orderId); return key ? {type:'license',fileId:key,fileName:'license-key',caption:`🎁 ${p.name}`} : null; }
  if(!p.fulfillment_file_id) return null;
  return {type:p.fulfillment_type || 'document',fileId:p.fulfillment_file_id,fileName:p.fulfillment_file_name || p.name,caption:p.fulfillment_caption || `🎁 ${p.name}\n\nᴛʜᴀɴᴋ ʏᴏᴜ ғᴏʀ sʜᴏᴘᴘɪɴɢ ᴡɪᴛʜ ʀᴜsʜ!`};
}
function addLicenseKeys(productId, keys) {
  const clean = [...new Set((keys || []).map(x => String(x).trim()).filter(Boolean))];
  if (!clean.length) return {ok:false, added:0};
  const stmt = db.db.prepare('INSERT OR IGNORE INTO store_license_keys (product_id,license_key) VALUES (?,?)');
  let added = 0;
  const tx = db.db.transaction(() => clean.forEach(k => { const r = stmt.run(productId, k); added += r.changes; }));
  tx();
  return {ok:true, added};
}
function claimLicenseKey(productId, userId, orderId) {
  const key = db.db.prepare("SELECT * FROM store_license_keys WHERE product_id=? AND status='available' ORDER BY id LIMIT 1").get(productId);
  if (!key) return null;
  db.db.prepare("UPDATE store_license_keys SET status='claimed',order_id=?,user_id=?,claimed_at=datetime('now') WHERE id=? AND status='available'").run(orderId,userId,key.id);
  return key.license_key;
}
function buy(userId, productId, quantity=1){
  const q=Math.max(1,Math.min(99,Math.trunc(Number(quantity)||1)));
  return db.db.transaction(()=>{const p=db.db.prepare('SELECT * FROM store_products WHERE id=? AND active=1').get(productId);if(!p)return {ok:false,reason:'product'};if(p.stock>=0&&p.stock<q)return {ok:false,reason:'stock'};const u=db.getUser(userId);const total=p.price*q;if(!u||u.points<total)return {ok:false,reason:'points',price:p.price,total,user:u};db.db.prepare('UPDATE users SET points=points-? WHERE user_id=?').run(total,userId);if(p.stock>=0)db.db.prepare('UPDATE store_products SET stock=stock-? WHERE id=?').run(q,p.id);const info=db.db.prepare('INSERT INTO store_orders (user_id,product_id,quantity,total) VALUES (?,?,?,?)').run(userId,p.id,q,total);db.db.prepare('INSERT INTO point_transactions (user_id,amount,reason,reference) VALUES (?,?,?,?)').run(userId,-total,'store_purchase',String(info.lastInsertRowid));db.db.prepare("INSERT INTO player_inventory (user_id,product_id,quantity) VALUES (?,?,?) ON CONFLICT(user_id,product_id) DO UPDATE SET quantity=quantity+excluded.quantity,updated_at=datetime('now')").run(userId,p.id,q);return {ok:true,orderId:info.lastInsertRowid,total,product:p,user:db.getUser(userId)};})();
}
function orders(userId,limit=20){return db.db.prepare('SELECT o.*,p.name FROM store_orders o JOIN store_products p ON p.id=o.product_id WHERE o.user_id=? ORDER BY o.id DESC LIMIT ?').all(userId,Math.max(1,Number(limit)||20));}

init();
function listPurchasedProducts(userId){
  return db.db.prepare(`SELECT DISTINCT p.*, MAX(o.created_at) last_purchased, SUM(o.quantity) purchased_qty
    FROM store_orders o JOIN store_products p ON p.id=o.product_id WHERE o.user_id=? AND o.status='completed'
    GROUP BY p.id ORDER BY last_purchased DESC`).all(userId);
}
function getDeliveryForReDownload(userId, productId){
  const bought=db.db.prepare("SELECT 1 FROM store_orders WHERE user_id=? AND product_id=? AND status='completed' LIMIT 1").get(userId,productId);
  if(!bought)return null;
  const p=getProduct(productId); if(!p || !p.fulfillment_file_id || p.fulfillment_type==='license')return null;
  return {type:p.fulfillment_type||'document',fileId:p.fulfillment_file_id,fileName:p.fulfillment_file_name||p.name,caption:p.fulfillment_caption||`🎁 ${p.name}`};
}
function rateProduct(userId, productId, rating, review=''){
  const r=Math.trunc(Number(rating)); if(r<1||r>5)return {ok:false,reason:'rating'};
  const bought=db.db.prepare("SELECT 1 FROM store_orders WHERE user_id=? AND product_id=? AND status='completed' LIMIT 1").get(userId,productId);
  if(!bought)return {ok:false,reason:'purchase'};
  db.db.prepare(`INSERT INTO store_ratings(user_id,product_id,rating,review) VALUES(?,?,?,?) ON CONFLICT(user_id,product_id) DO UPDATE SET rating=excluded.rating,review=excluded.review,created_at=datetime('now')`).run(userId,productId,r,String(review||'').slice(0,500));
  return {ok:true};
}
function productRating(productId){return db.db.prepare('SELECT ROUND(AVG(rating),1) avg, COUNT(*) count FROM store_ratings WHERE product_id=?').get(productId);}
function featuredProducts(limit=10){return db.db.prepare(`SELECT p.*, COALESCE(SUM(o.quantity),0) sold, COALESCE(AVG(r.rating),0) rating, COUNT(r.id) reviews FROM store_products p LEFT JOIN store_orders o ON o.product_id=p.id AND o.status='completed' LEFT JOIN store_ratings r ON r.product_id=p.id WHERE p.active=1 GROUP BY p.id ORDER BY p.featured DESC, sold DESC, rating DESC, p.id DESC LIMIT ?`).all(Math.max(1,Number(limit)||10));}
function createDiscountCode(code,percent,maxUses=-1,expiresAt=null){const c=String(code||'').trim().toUpperCase();const pct=Math.trunc(Number(percent));const max=Math.trunc(Number(maxUses));if(!/^[A-Z0-9_-]{3,32}$/.test(c)||pct<1||pct>100||(!Number.isFinite(max))||max===0||max<-1)return {ok:false,reason:'invalid'};try{const r=db.db.prepare('INSERT INTO store_discount_codes(code,percent,max_uses,expires_at) VALUES(?,?,?,?)').run(c,pct,max,expiresAt||null);return {ok:true,id:r.lastInsertRowid};}catch(e){return {ok:false,reason:'exists'};}}
function getDiscount(code){if(!code)return null;const row=db.db.prepare('SELECT * FROM store_discount_codes WHERE code=? AND active=1').get(String(code).trim().toUpperCase());if(!row)return null;if(row.expires_at && Date.parse(row.expires_at.replace(' ','T')+'Z')<=Date.now())return null;if(row.max_uses>=0&&row.used_count>=row.max_uses)return null;return row;}
function useDiscount(code){const d=getDiscount(code);if(!d)return null;db.db.prepare('UPDATE store_discount_codes SET used_count=used_count+1 WHERE id=?').run(d.id);return d;}
function setFeatured(productId,featured=1){const p=getProduct(productId);if(!p)return {ok:false,reason:'product'};db.db.prepare('UPDATE store_products SET featured=? WHERE id=?').run(featured?1:0,productId);return {ok:true};}
function giftPurchase(senderId,receiverId,productId,quantity=1,discountCode=''){
  if(senderId===receiverId)return {ok:false,reason:'self'};
  const receiver=db.getUser(receiverId);if(!receiver)return {ok:false,reason:'user'};
  const q=Math.max(1,Math.min(99,Math.trunc(Number(quantity)||1))); const p=getProduct(productId);if(!p)return {ok:false,reason:'product'};
  const base=p.price*q; const d=getDiscount(discountCode); if(discountCode&&!d)return {ok:false,reason:'discount'}; const total=Math.floor(base*(d?100-d.percent:100)/100); const u=db.getUser(senderId);if(!u||u.points<total)return {ok:false,reason:'points',total,user:u};
  return db.db.transaction(()=>{db.db.prepare('UPDATE users SET points=points-? WHERE user_id=?').run(total,senderId);if(p.stock>=0){if(p.stock<q)return {ok:false,reason:'stock'};db.db.prepare('UPDATE store_products SET stock=stock-? WHERE id=?').run(q,p.id);}const oi=db.db.prepare('INSERT INTO store_orders(user_id,product_id,quantity,total) VALUES(?,?,?,?)').run(senderId,p.id,q,total);db.db.prepare('INSERT INTO point_transactions(user_id,amount,reason,reference) VALUES(?,?,?,?)').run(senderId,-total,'store_gift_purchase',String(oi.lastInsertRowid));db.db.prepare('INSERT INTO player_inventory(user_id,product_id,quantity) VALUES(?,?,?) ON CONFLICT(user_id,product_id) DO UPDATE SET quantity=quantity+excluded.quantity,updated_at=datetime(\'now\')').run(receiverId,p.id,q);db.db.prepare('INSERT INTO store_gifts(order_id,sender_id,receiver_id,product_id,quantity) VALUES(?,?,?,?,?)').run(oi.lastInsertRowid,senderId,receiverId,p.id,q);if(d)useDiscount(d.code);return {ok:true,orderId:oi.lastInsertRowid,total,product:p,receiver};})();
}

module.exports={CATEGORIES,bank,deposit,withdrawBank,transfer,requestWithdrawal,listWithdrawals,getCategories,getProducts,getProduct,createDigitalProduct,fulfillProduct,addLicenseKeys,claimLicenseKey,buy,orderslistPurchasedProducts,getDeliveryForReDownload,rateProduct,productRating,featuredProducts,createDiscountCode,getDiscount,useDiscount,setFeatured,giftPurchase};


function inventory(userId){return db.db.prepare('SELECT i.*,p.name,p.description,p.price FROM player_inventory i JOIN store_products p ON p.id=i.product_id WHERE i.user_id=? AND i.quantity>0 ORDER BY i.updated_at DESC').all(userId);}
function addToCart(userId,productId,quantity=1){const q=Math.max(1,Math.min(99,Math.trunc(Number(quantity)||1)));const p=db.db.prepare('SELECT * FROM store_products WHERE id=? AND active=1').get(productId);if(!p)return {ok:false,reason:'product'};db.db.prepare('INSERT INTO store_cart (user_id,product_id,quantity) VALUES (?,?,?) ON CONFLICT(user_id,product_id) DO UPDATE SET quantity=quantity+excluded.quantity').run(userId,productId,q);return {ok:true};}
function cart(userId){return db.db.prepare('SELECT c.*,p.name,p.price,p.stock FROM store_cart c JOIN store_products p ON p.id=c.product_id WHERE c.user_id=? ORDER BY c.product_id').all(userId);}
function clearCart(userId){db.db.prepare('DELETE FROM store_cart WHERE user_id=?').run(userId);}
function checkoutCart(userId){return db.db.transaction(()=>{const items=cart(userId);if(!items.length)return {ok:false,reason:'empty'};let total=0;for(const x of items){if(x.stock>=0&&x.stock<x.quantity)return {ok:false,reason:'stock',product:x};total+=x.price*x.quantity;}const u=db.getUser(userId);if(!u||u.points<total)return {ok:false,reason:'points',total,user:u};for(const x of items){const r=buy(userId,x.product_id,x.quantity);if(!r.ok)throw new Error('checkout failed');}clearCart(userId);return {ok:true,total,user:db.getUser(userId),items};})();}
function giftItem(senderId,receiverId,productId,quantity=1){const q=Math.max(1,Math.min(99,Math.trunc(Number(quantity)||1)));return db.db.transaction(()=>{const r=db.db.prepare('SELECT * FROM player_inventory WHERE user_id=? AND product_id=?').get(senderId,productId);if(!r||r.quantity<q)return {ok:false,reason:'inventory'};if(!db.getUser(receiverId))return {ok:false,reason:'user'};db.db.prepare('UPDATE player_inventory SET quantity=quantity-?,updated_at=datetime(\'now\') WHERE user_id=? AND product_id=?').run(q,senderId,productId);db.db.prepare('INSERT INTO player_inventory (user_id,product_id,quantity) VALUES (?,?,?) ON CONFLICT(user_id,product_id) DO UPDATE SET quantity=quantity+excluded.quantity,updated_at=datetime(\'now\')').run(receiverId,productId,q);const x=db.db.prepare('INSERT INTO item_gifts (sender_id,receiver_id,product_id,quantity) VALUES (?,?,?,?)').run(senderId,receiverId,productId,q);return {ok:true,id:x.lastInsertRowid};})();}
function tradeOffer(senderId,receiverId,offerProductId,offerQty,requestProductId,requestQty){if(senderId===receiverId)return {ok:false,reason:'self'};const inv=db.db.prepare('SELECT quantity FROM player_inventory WHERE user_id=? AND product_id=?').get(senderId,offerProductId);if(!inv||inv.quantity<offerQty)return {ok:false,reason:'inventory'};const x=db.db.prepare('INSERT INTO item_trades (sender_id,receiver_id,offer_product_id,offer_qty,request_product_id,request_qty) VALUES (?,?,?,?,?,?)').run(senderId,receiverId,offerProductId,offerQty,requestProductId,requestQty);return {ok:true,id:x.lastInsertRowid};}
function trades(userId){return db.db.prepare('SELECT t.*,op.name offer_name,rp.name request_name FROM item_trades t JOIN store_products op ON op.id=t.offer_product_id JOIN store_products rp ON rp.id=t.request_product_id WHERE t.receiver_id=? OR t.sender_id=? ORDER BY t.id DESC LIMIT 30').all(userId,userId);}
function acceptTrade(userId,id){return db.db.transaction(()=>{const t=db.db.prepare('SELECT * FROM item_trades WHERE id=? AND receiver_id=? AND status=\'pending\'').get(id,userId);if(!t)return {ok:false,reason:'trade'};const a=db.db.prepare('SELECT quantity FROM player_inventory WHERE user_id=? AND product_id=?').get(t.sender_id,t.offer_product_id);const b=db.db.prepare('SELECT quantity FROM player_inventory WHERE user_id=? AND product_id=?').get(t.receiver_id,t.request_product_id);if(!a||a.quantity<t.offer_qty||!b||b.quantity<t.request_qty)return {ok:false,reason:'inventory'};const move=(uid,pid,q)=>db.db.prepare('INSERT INTO player_inventory (user_id,product_id,quantity) VALUES (?,?,?) ON CONFLICT(user_id,product_id) DO UPDATE SET quantity=quantity+excluded.quantity,updated_at=datetime(\'now\')').run(uid,pid,q);move(t.sender_id,t.request_product_id,t.request_qty);move(t.receiver_id,t.offer_product_id,t.offer_qty);db.db.prepare('UPDATE player_inventory SET quantity=quantity-?,updated_at=datetime(\'now\') WHERE user_id=? AND product_id=?').run(t.offer_qty,t.sender_id,t.offer_product_id);db.db.prepare('UPDATE player_inventory SET quantity=quantity-?,updated_at=datetime(\'now\') WHERE user_id=? AND product_id=?').run(t.request_qty,t.receiver_id,t.request_product_id);db.db.prepare('UPDATE item_trades SET status=\'accepted\' WHERE id=?').run(id);return {ok:true};})();}
function economyLeaderboard(limit=10){return db.db.prepare('SELECT u.user_id,u.username,u.points,COALESCE((SELECT SUM(quantity) FROM player_inventory i WHERE i.user_id=u.user_id),0) AS items FROM users u ORDER BY u.points DESC,items DESC LIMIT ?').all(limit);}
function claimDaily(userId){const today=new Date().toISOString().slice(0,10);const row=db.db.prepare('SELECT claimed_at FROM economy_daily WHERE user_id=?').get(userId);if(row&&row.claimed_at===today)return {ok:false};db.db.prepare('INSERT INTO economy_daily(user_id,claimed_at) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET claimed_at=excluded.claimed_at').run(userId,today);db.db.prepare('UPDATE users SET points=points+100,xp=xp+25 WHERE user_id=?').run(userId);return {ok:true,reward:100};}
function adminStoreStats(){return {products:db.db.prepare('SELECT COUNT(*) n FROM store_products').get().n,orders:db.db.prepare('SELECT COUNT(*) n FROM store_orders').get().n,sales:db.db.prepare('SELECT COALESCE(SUM(total),0) n FROM store_orders').get().n,inventory:db.db.prepare('SELECT COALESCE(SUM(quantity),0) n FROM player_inventory').get().n,pending:db.db.prepare("SELECT COUNT(*) n FROM point_withdrawals WHERE status='pending'").get().n};}
module.exports.inventory=inventory;module.exports.addToCart=addToCart;module.exports.cart=cart;module.exports.clearCart=clearCart;module.exports.checkoutCart=checkoutCart;module.exports.giftItem=giftItem;module.exports.tradeOffer=tradeOffer;module.exports.trades=trades;module.exports.acceptTrade=acceptTrade;module.exports.economyLeaderboard=economyLeaderboard;module.exports.claimDaily=claimDaily;module.exports.adminStoreStats=adminStoreStats;
