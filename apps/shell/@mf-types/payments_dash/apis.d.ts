
    export type RemoteKeys = 'payments_dash/PaymentsDash' | 'payments_dash/PaymentsDashNext';
    type PackageType<T> = T extends 'payments_dash/PaymentsDashNext' ? typeof import('payments_dash/PaymentsDashNext') :T extends 'payments_dash/PaymentsDash' ? typeof import('payments_dash/PaymentsDash') :any;