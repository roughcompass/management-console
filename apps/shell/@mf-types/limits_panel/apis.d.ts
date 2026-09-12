
    export type RemoteKeys = 'limits_panel/LimitsPanel';
    type PackageType<T> = T extends 'limits_panel/LimitsPanel' ? typeof import('limits_panel/LimitsPanel') :any;