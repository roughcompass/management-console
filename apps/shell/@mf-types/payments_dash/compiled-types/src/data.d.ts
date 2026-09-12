export interface Position {
    id: string;
    account: string;
    instrument: string;
    notional: number;
    ccy: string;
    status: 'settled' | 'pending' | 'failed';
}
export declare function fetchPositions(accountId: string): Promise<Position[]>;
export declare function money(value: number, ccy: string): string;
//# sourceMappingURL=data.d.ts.map