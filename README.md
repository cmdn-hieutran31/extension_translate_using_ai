# AI Translator & Grammar Check Extension - Tài liệu Dự án

Tài liệu này cung cấp thông tin chi tiết về dự án **AI Translator & Grammar Check**, được biên soạn nhằm mục đích hỗ trợ AI khác đọc và tự động tạo Slide thuyết trình. Nội dung bao gồm tổng quan, tính năng, kiến trúc kỹ thuật và hướng dẫn sử dụng.

---

## 1. Tổng quan Dự án (Project Overview)

### Tên dự án

**AI Translator & Grammar Check**

### Giới thiệu (Introduction)

Đây là một tiện ích mở rộng (Extension) dành cho trình duyệt Chrome, tích hợp trí tuệ nhân tạo (Google Gemini AI) để hỗ trợ người dùng dịch thuật văn bản, kiểm tra ngữ pháp và trích xuất văn bản từ hình ảnh trực tiếp trên mọi trang web mà không cần chuyển đổi tab.

### Mục tiêu (Goal)

Giải quyết vấn đề gián đoạn quy trình làm việc (workflow) khi người dùng phải copy-paste văn bản sang các công cụ dịch thuật bên ngoài. Extension mang lại trải nghiệm liền mạch, thông minh và chính xác nhờ sức mạnh của LLM (Gemini).

---

## 2. Các Tính năng Chính (Key Features)

### 🌍 1. Dịch thuật Đa ngôn ngữ Thông minh (Smart Translation)

- **Hỗ trợ 13+ ngôn ngữ**: Tiếng Anh, Việt, Tây Ban Nha, Pháp, Đức, Nhật, Hàn, Trung, v.v.
- **Dịch theo ngữ cảnh**: Sử dụng Gemini AI để hiểu ngữ cảnh câu văn, mang lại bản dịch tự nhiên hơn so với dịch máy thông thường.
- **Cơ chế Fallback (Dự phòng)**:
    - Ưu tiên sử dụng **MyMemory API** (Miễn phí, nhanh) cho các bản dịch đơn giản.
    - Tự động chuyển sang **Gemini AI** (Thông minh hơn) nếu MyMemory thất bại hoặc khi người dùng yêu cầu dịch nâng cao.

### ✍️ 2. Kiểm tra & Sửa lỗi Ngữ pháp (Grammar Check)

- **Phát hiện lỗi sai**: Nhận diện lỗi ngữ pháp, chính tả, dấu câu.
- **Giải thích & Sửa lỗi**: Hiển thị phiên bản đã sửa và làm nổi bật các thay đổi (Diff view) để người dùng dễ dàng so sánh.
- **Cơ chế Fallback**: Ưu tiên **LanguageTool** (Nhanh) và dự phòng bằng **Gemini AI** (Sâu hơn).

### 🖼️ 3. Trích xuất Text từ Hình ảnh (OCR)

- Sử dụng **Gemini Vision API** để nhận diện và trích xuất văn bản từ hình ảnh trên web.
- Giữ nguyên định dạng dòng và cấu trúc văn bản gốc.

### ⚡ 4. Trải nghiệm Người dùng (UX/UI)

- **Floating Icon**: Biểu tượng dịch nhanh xuất hiện ngay khi bôi đen văn bản (tương tự Medium/Notion).
- **Phím tắt (Shortcuts)**:
    - `Alt+T`: Dịch văn bản đã chọn.
    - `Alt+G`: Kiểm tra ngữ pháp.
- **Giao diện hiện đại**: Thiết kế clean, animations mượt mà, hỗ trợ Dark/Light mode theo hệ thống.

---

## 3. Kiến trúc Kỹ thuật (Technical Architecture)

Dự án được xây dựng theo tiêu chuẩn **Chrome Extension Manifest V3**, đảm bảo hiệu năng và bảo mật.

### Sơ đồ Luồng dữ liệu (Data Flow)

1. **User Action**: Người dùng bôi đen văn bản trên trang web -> `content.js` kích hoạt.
2. **UI Rendering**: `content.js` hiển thị Floating Icon hoặc Popup ngay tại vị trí con trỏ.
3. **Request Handling**: Khi người dùng bấm nút, `content.js` gửi message tới `background.js`.
4. **API Management (`background.js`)**:
    - Kiểm tra Settings (API Key, Language).
    - Điều phối gọi API (MyMemory / LanguageTool / Gemini).
    - Xử lý lỗi và Fallback.
5. **Response**: Kết quả trả về `content.js` để hiển thị lên Popup.

### Các Thành phần Chính (Components)

- **Manifest.json**: Cấu hình quyền hạn (`activeTab`, `storage`, `scripting`), khai báo background worker và content scripts.
- **Background Service Worker (`background.js`)**: "Bộ não" trung tâm, xử lý các tác vụ bất đồng bộ, gọi API bên ngoài để tránh lộ API Key và bypass CORS.
- **Content Script (`content.js`)**: Cầu nối tương tác với trang web hiện tại (DOM manipulation), xử lý sự kiện chuột/phím, hiển thị giao diện người dùng (Shadow DOM hoặc Inject trực tiếp).
- **Settings & Storage**: Quản lý API Key người dùng và các tùy chọn cá nhân hóa lưu trong `chrome.storage.local`.

---

## 4. Ngăn xếp Công nghệ (Tech Stack)

- **Core**: HTML5, CSS3, Vanilla JavaScript (ES6+). Không sử dụng Framework nặng nề để tối ưu tốc độ.
- **Platform**: Chrome Extension API (Manifest V3).
- **AI Models**: Google Gemini 1.5 Flash / Pro (thông qua API).
- **External Services**: MyMemory API (Translation), LanguageTool API (Grammar).

---

## 5. Hướng dẫn Cài đặt & Sử dụng (Installation & Usage)

### Cài đặt

1. Clone repository về máy.
2. Mở Chrome, truy cập `chrome://extensions/`.
3. Bật **Developer mode**.
4. Chọn **Load unpacked** -> trỏ đến thư mục dự án.

### Cấu hình

1. Click vào icon Extension trên thanh công cụ -> Mở Settings.
2. Nhập **Google Gemini API Key** (Lấy từ Google AI Studio).
3. Chọn ngôn ngữ đích mặc định (ví dụ: Vietnamese).

### Sử dụng

- **Dịch nhanh**: Bôi đen text -> Bấm vào icon xuất hiện -> Xem bản dịch.
- **Check ngữ pháp**: Bôi đen text -> Chuột phải chọn "Check Grammar" hoặc bấm phím tắt `Alt+G`.

---

## 6. Tiềm năng & Hướng phát triển (Future Roadmap)

- **History Sync**: Đồng bộ lịch sử dịch giữa các thiết bị.
- **Audio Mode**: Nghe phát âm văn bản gốc và bản dịch (Text-to-Speech).
- **Document Translate**: Dịch toàn bộ file PDF/Docx.
- **Custom Prompts**: Cho phép người dùng tùy chỉnh prompt gửi tới AI (ví dụ: "Dịch theo phong cách hài hước").

---

## 7. Giấy phép (License)

Dự án mã nguồn mở (Open Source) phục vụ mục đích học tập và nghiên cứu.
