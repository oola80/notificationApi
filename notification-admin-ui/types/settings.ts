export interface SystemConfig {
  key: string;
  value: string;
  description: string | null;
  updatedAt: string;
}

export interface UpdateSystemConfigDto {
  value: string;
}
