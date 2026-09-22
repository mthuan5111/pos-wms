export type AuthStackParamList = {
    Login: undefined;
}

export type MainTabParamList = {
    Dashboard: undefined;
    POS: undefined;
    Inventory?: {
        tab?: "products" | "categories" | "suppliers" | "receipts";
        search?: string;
        targetProductId?: number | string;
        targetBarcode?: string;
        focusField?: "price" | "lowStockThreshold";
    };
    Invoice: undefined;
    WarehouseInvoice: undefined;
    Statistics: undefined;
    UserManagement: undefined;
    SystemLog: undefined;
    Settings: undefined;
    CashierSettings: undefined;
    WarehouseSettings: undefined;
};