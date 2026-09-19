import mongoose, { Schema, Model } from 'mongoose';
import { IUser, UserRole, AccountantType, UserStatus } from '../types/models.js';

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'User name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'User email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false, // Do not return password hash by default in queries
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.MEMBER,
      required: true,
      index: true,
    },
    accountantType: {
      type: String,
      enum: [...Object.values(AccountantType), null],
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(UserStatus),
      default: UserStatus.ACTIVE,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const User: Model<IUser> = mongoose.model<IUser>('User', userSchema);
export default User;
