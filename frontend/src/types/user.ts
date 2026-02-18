/**
 * User Types
 */

export interface User {
  id: string;
  email: string;
  username?: string;
  isActive: boolean;
  isSuperuser: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface UserCreate {
  email: string;
  password: string;
  username?: string;
}

export interface UserLogin {
  email: string;
  password: string;
}

export interface UserUpdate {
  email?: string;
  password?: string;
  username?: string;
}

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  orderFilled: boolean;
  priceAlerts: boolean;
  newsAlerts: boolean;
}
