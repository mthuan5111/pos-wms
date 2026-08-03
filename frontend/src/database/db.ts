import * as SQLite from 'expo-sqlite';

export const getDBConnection = async () => {
    return await SQLite.openDatabaseAsync('pos_wms_local.db');
};

export const initLocalDatabase = async () => {
    try {
        const db = await getDBConnection();
        await db.execAsync(`
            PRAGMA journal_mode = WAL; -- Lệnh tối ưu tốc độ đọc/ghi cho SQLite

            -- Bảng Sản phẩm
            CREATE TABLE IF NOT EXISTS LocalProducts (
                Id TEXT PRIMARY KEY,
                Name TEXT NOT NULL,
                Price REAL NOT NULL,
                Barcode TEXT,
                StockQuantity INTEGER NOT NULL
            );

            -- Bảng Đơn hàng
            CREATE TABLE IF NOT EXISTS LocalOrders (
                OfflineReferenceId TEXT PRIMARY KEY,
                TotalAmount REAL NOT NULL,
                CreatedAt TEXT NOT NULL,
                IsSynced INTEGER DEFAULT 0
            );

            -- Bảng Chi tiết đơn hàng
            CREATE TABLE IF NOT EXISTS LocalOrderDetails (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                OfflineReferenceId TEXT NOT NULL,
                ProductId TEXT NOT NULL,
                Quantity INTEGER NOT NULL,
                Price REAL NOT NULL,
                FOREIGN KEY (OfflineReferenceId) REFERENCES LocalOrders(OfflineReferenceId)
            );
        `);
        console.log("Khởi tạo Local Database thành công");
    } catch(error) {
        console.error("Lỗi khi khởi tạo SQLite:", error);
    }
}

export const insertLocalProduct = async (id: string, name: string, price: number, barcode: string, stock: number) => {
    try {
        const db = await getDBConnection();
        await db.runAsync(
            'INSERT OR REPLACE INTO LocalProducts (Id, Name, Price, Barcode, StockQuantity) VALUES (?, ?, ?, ?, ?)',
            [id, name, price, barcode, stock]
        );
    } catch (error) {
        console.error("Lỗi khi thêm sản phẩm local:", error);
    }
};

export const getLocalProducts = async () => {
    try {
        const db = await getDBConnection();
        const allRows = await db.getAllAsync('SELECT * FROM LocalProducts');
        return allRows;
    } catch (error) {
        console.error("Lỗi khi lấy sản phẩm local:", error);
        return [];
    }
};