# HƯỚNG DẪN & GIẢI THÍCH CHI TIẾT TÍNH NĂNG ADMIN DASHBOARD VÀ ADMIN STATISTIC API

Tài liệu này giải thích toàn bộ mã nguồn của hai nhiệm vụ trong dự án **CWA (Collaborative Whiteboard App)**:

1. **Nhiệm vụ 1**: Xây dựng toàn bộ giao diện Admin Dashboard (Next.js)
2. **Nhiệm vụ 2**: Xây dựng hệ thống Admin Statistic API với bảo mật 2 lớp (NestJS)

---

## 1. NGUYÊN LÝ HOẠT ĐỘNG & BẢO MẬT HỆ THỐNG

### Phân loại người dùng

| Loại       | Mô tả                                                                    |
| ---------- | ------------------------------------------------------------------------ |
| **Guest**  | Dùng bảng vẽ cộng tác mà **không cần đăng nhập**                        |
| **User**   | Đăng nhập bằng tài khoản thông thường – không có quyền admin             |
| **Admin**  | Đăng nhập bằng tài khoản `role = "admin"` – mới được vào khu vực `/admin` |

### Cơ chế Bảo mật 2 Lớp (Defense in Depth)

```
Request API Admin
        │
        ▼
┌─────────────────────────────────────────────┐
│ Lớp 1 – JwtAuthGuard                        │
│ Kiểm tra JWT Access Token                   │
│ Chặn → 401 Unauthorized (ERR_AUTHENTICATION_REQUIRED) │
└───────────────────┬─────────────────────────┘
                    │ Token hợp lệ
                    ▼
┌─────────────────────────────────────────────┐
│ Lớp 2 – AdminRoleGuard                      │
│ Truy vấn DB: ParticipantEntity → UserEntity │
│ Kiểm tra user.role === 'admin'              │
│ Chặn → 403 Forbidden (ERR_FORBIDDEN)        │
└───────────────────┬─────────────────────────┘
                    │ role = admin
                    ▼
              Controller xử lý
```

---

## 2. NHIỆM VỤ 2: ADMIN STATISTIC API (BACKEND – NESTJS)

### 2.1 Cấu trúc thư mục

```
API/src/admin/
├── dto/
│   ├── AdminStatsOverviewDto.ts   # Tổng quan: totalUsers, totalRooms, totalParticipants, newXToday
│   ├── AdminUserStatsDto.ts       # Users: byRole { admin, user, guest } + dailyGrowth 30 ngày
│   └── AdminRoomStatsDto.ts       # Rooms: activeRoomsLast24h + dailyGrowth 30 ngày
├── guard/
│   └── admin-role.guard.ts        # Lớp bảo mật 2 – kiểm tra role admin trong DB
├── admin.contracts.ts             # Interfaces + Injection Tokens (nguyên lý DIP)
├── admin.service.ts               # Xử lý nghiệp vụ: thống kê & phân trang
├── admin.controller.ts            # 5 REST endpoints, bảo vệ 2 lớp
└── admin.module.ts                # Đăng ký Module
```

### 2.2 Danh sách 5 Endpoints

| Method | Endpoint                        | Mô tả                                            |
| ------ | ------------------------------- | ------------------------------------------------ |
| GET    | `/admin/stats/overview`         | Tổng quan: users, rooms, participants, mới hôm nay |
| GET    | `/admin/stats/users`            | Phân bổ role + tăng trưởng 30 ngày               |
| GET    | `/admin/stats/rooms`            | Phòng active 24h + tăng trưởng 30 ngày           |
| GET    | `/admin/users?page=1&limit=20`  | Danh sách users có phân trang                    |
| GET    | `/admin/rooms?page=1&limit=20`  | Danh sách rooms có phân trang                    |

### 2.3 Cấu trúc Redis (thực tế từ hệ thống)

Redis lưu trữ trạng thái **realtime** theo các key pattern sau:

```
board-element:{elementId}                              → STRING (JSON element data)
room:{roomId}                                          → STRING (JSON: { id, lastActiveAt, createdAt, updatedAt })
room:{roomId}:participants:{participantId}              → HASH  (joinedAt, displayName, themeColor, cursorX, cursorY)
```

> **Lưu ý**: Admin API hiện tại đọc dữ liệu từ **PostgreSQL** (lịch sử), không phải Redis (realtime). Số lượng participants trong grid hiển thị từ DB. Tích hợp Redis để đếm người online thời gian thực là bước tiếp theo.

### 2.4 AdminService – Kỹ thuật tối ưu

```typescript
// Chạy song song các query để giảm latency
const [totalUsers, totalRooms, ...] = await Promise.all([
  this.userRepository.count(),
  this.roomRepository.count(),
  ...
]);

// Raw SQL group by ngày (PostgreSQL)
SELECT DATE("createdAt") as date, COUNT(*) as count
FROM "table"
WHERE "createdAt" >= $1
GROUP BY DATE("createdAt")
ORDER BY date ASC
```

---

## 3. NHIỆM VỤ 1: ADMIN DASHBOARD (FRONTEND – NEXTJS)

### 3.1 Cấu trúc thư mục

```
WEB/src/
├── app/admin/
│   ├── dashboard/page.tsx       # Tổng quan: 4 StatsCard + biểu đồ + quick view
│   ├── users/page.tsx           # Quản lý Users: tìm kiếm + lọc role + UserTable
│   ├── rooms/page.tsx           # Quản lý Rooms: tìm kiếm + RoomGrid (lưới)
│   ├── layout.tsx               # AuthLayout + AdminGuard + Sidebar + Header
│   ├── page.tsx                 # redirect('/admin/dashboard')
│   └── admin.css                # Toàn bộ CSS: layout, card, table, room grid
├── components/admin/
│   ├── AdminGuard.tsx           # Bảo vệ route client-side
│   ├── AdminSidebar.tsx         # Menu điều hướng, highlight active tab
│   ├── StatsCard.tsx            # Thẻ chỉ số + badge tăng trưởng
│   ├── UserTable.tsx            # Bảng users: avatar, badge role, phân trang
│   ├── RoomTable.tsx            # Bảng rooms (dùng ở dashboard quick view)
│   └── RoomGrid.tsx             # Lưới phòng vẽ dành cho /admin/rooms
└── services/client/slice/
    └── admin.slice.ts           # RTK Query: 5 hooks kết nối 5 API endpoints
```

### 3.2 RoomGrid – UI Lưới Phòng Vẽ

Mỗi card trong lưới hiển thị:
- **Frame ảnh trạng thái bảng** (160px, placeholder gradient – sẽ tích hợp snapshot sau)
- **Badge trạng thái** (🟢 Đang hoạt động / ⚫ Không hoạt động)
- **Room ID** (dạng mono, rút gọn) + nút sao chép
- **Link phòng**: `/room/{roomId}` ✅ (đã sửa từ `/board/{id}`)
- **Lần hoạt động gần nhất** và **Ngày tạo**
- **Nút "Vào phòng"** mở tab mới → `/room/{roomId}`
  - Màu **xanh lá** nếu phòng đang hoạt động (active)
  - Màu **indigo** nếu phòng không hoạt động

### 3.3 Types đã chuẩn hóa

| Frontend Type   | Tương ứng Backend DTO | Ghi chú                                      |
| --------------- | --------------------- | -------------------------------------------- |
| `AdminUserItem` | `UserDto`             | id, name, email, role, createdAt, updatedAt  |
| `RoomDto`       | `RoomDto`             | id, lastActiveAt, createdAt, updatedAt       |
| `AdminUserRow`  | -                     | Type nội bộ của `UserTable.tsx`              |

### 3.4 Luồng xác thực Client

```
Truy cập /admin
    │
    ▼
AuthLayout → gọi /auth/refresh (HTTP-only cookie)
    │
    ▼
AdminGuard đọc Redux state.auth
    ├── isLoading=true → spinner "Đang xác thực..."
    ├── !isLoggedIn   → redirect('/auth/login')
    ├── role ≠ admin  → Màn hình "Truy cập bị từ chối"
    └── role = admin  → Render Dashboard ✅
```

### 3.5 RTK Query + Tự động đính kèm token

`apiClient` (RTK Query base) tự động thêm `Authorization: Bearer <accessToken>` vào mọi request gửi tới backend, đảm bảo vượt qua cả 2 lớp bảo vệ.

---

## 4. DANH SÁCH LỖI ĐÃ SỬA

| File | Lỗi | Sửa thành |
| ---- | ---- | ---- |
| `RoomTable.tsx` | Link `/board/${room.id}` | `/room/${room.id}` |
| `RoomGrid.tsx`  | Link `/board/${room.id}` | `/room/${room.id}` |
| `UserTable.tsx` | `user.createAt` (typo) | `user.createdAt` |
| `UserTable.tsx` | `AdminUserRow.createAt` | `AdminUserRow.createdAt` |
| `UserTable.tsx` | `user.username \|\| user.name` | `user.name` (backend không có `username`) |
| `users/page.tsx` | `user.username \|\| user.name` | `user.name` |
| `admin.slice.ts` | Dùng `UserDetails` (thiếu createdAt) | Dùng `AdminUserItem` |
| `admin/page.tsx` | Re-export component (không redirect được) | `redirect('/admin/dashboard')` |
| `StatsCard.tsx` | `React.ReactNode` thiếu import | Thêm `import React from "react"` |

---

## 5. HƯỚNG DẪN ĐĂNG NHẬP & TRẢI NGHIỆM

### Bước 1: Mở trang đăng nhập
👉 `http://localhost:8080/auth/login`

### Bước 2: Đăng nhập tài khoản Admin
- **Email**: `admin@example.com`
- **Mật khẩu**: `Klmnop123@`
- Hệ thống tự nhận diện role `admin` → điều hướng đến `/admin/dashboard`

### Bước 3: Khám phá Dashboard
- **Dashboard** (`/admin/dashboard`): 4 StatsCard, biểu đồ tăng trưởng 14 ngày, phân bổ vai trò
- **Quản lý Users** (`/admin/users`): Tìm kiếm, lọc role, bảng phân trang
- **Quản lý Rooms** (`/admin/rooms`): Lưới phòng vẽ với ảnh preview, badge trạng thái, nút vào phòng

### Bước 4: Thử nghiệm bảo mật
- Đăng nhập bằng `testuser@example.com` / `Klmnop123@` → màn hình "Truy cập bị từ chối"
- Gọi thẳng API → Backend trả `403 Forbidden` (`ERR_FORBIDDEN`)
