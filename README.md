<p align="center">
  <img src="icons/icon128.png" width="96" height="96" alt="Dual Subtitles & Translator">
</p>

<h1 align="center">Dual Subtitles & Translator for YouTube, Udemy</h1>

<p align="center">
  <b>Phụ đề song ngữ cho Udemy và YouTube</b><br>
  Phụ đề gốc ở trên, bản dịch ở dưới. Miễn phí, không giới hạn, không cần tài khoản hay API key.
</p>

<p align="center">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-6366f1"></a>
  <img alt="Manifest V3" src="https://img.shields.io/badge/manifest-v3-4338ca">
  <img alt="Udemy, YouTube" src="https://img.shields.io/badge/sites-Udemy%20%7C%20YouTube-ffd84d">
  <img alt="Chrome, Edge" src="https://img.shields.io/badge/browser-Chrome%20%7C%20Edge-22c55e">
</p>

---

Học trên Udemy, xem YouTube bằng tiếng nước ngoài mà vẫn muốn hiểu trọn từng câu? Dual Subtitles đặt bản dịch ngay dưới phụ đề gốc của trình phát: vừa nghe tiếng gốc, vừa đọc bản dịch, không bỏ lỡ thuật ngữ.

## Tính năng

| | |
|---|---|
| **Hai dòng trên dưới** | Phụ đề gốc giữ nguyên, bản dịch màu vàng ở dưới, cỡ chữ đi theo trình phát (kể cả toàn màn hình). |
| **Udemy và YouTube** | Udemy: phụ đề WebVTT. YouTube: phụ đề do người tải lên lẫn phụ đề tự động. |
| **Dịch trước cả bài** | Trình phát vừa tải phụ đề là Dual Subtitles dịch toàn bộ; video tới câu nào đã có sẵn câu đó. |
| **Dịch theo lô** | Gom nhiều câu vào một request: 400 câu khoảng 6 request thay vì 400. Nhanh hơn, ít bị chặn hơn. |
| **Tự đổi nguồn dịch** | Lỗi hoặc bị giới hạn thì thử lại có chờ, rồi chuyển sang nguồn dịch dự phòng. |
| **Nhớ bản dịch** | Lưu tới 20 000 câu trong trình duyệt; xem lại bài cũ hiện ngay, không gọi dịch lại. |
| **Tuỳ chỉnh giao diện** | Màu chữ, cỡ chữ, độ đậm nền, chữ đậm, bản dịch ở trên hoặc dưới, có xem trước ngay trong popup. |
| **Sổ từ vựng** | Bôi đen từ trên phụ đề để tra nghĩa và lưu kèm câu ngữ cảnh; tìm, xoá, xuất CSV nhập vào Anki. |
| **Riêng tư** | Không máy chủ riêng, không tài khoản, không thu thập dữ liệu. Chỉ gửi câu phụ đề tới dịch vụ dịch của Google. |

Ngôn ngữ đích có sẵn: Tiếng Việt, English, 中文, 日本語, 한국어, Français. Thêm ngôn ngữ khác chỉ cần một dòng (xem [Phát triển](#phát-triển)).

## Cài đặt

Dual Subtitles chưa lên Chrome Web Store; cài từ mã nguồn mất khoảng một phút, chạy trên Chrome, Edge, Brave, Cốc Cốc và các trình duyệt nhân Chromium.

1. Tải mã nguồn: **Code → Download ZIP** rồi giải nén, hoặc
   ```sh
   git clone https://github.com/ledtudev/Dual-Subtitles-for-YouTube-Udemy.git
   ```
2. Mở `chrome://extensions` (Edge: `edge://extensions`), bật **Developer mode**.
3. Bấm **Load unpacked**, chọn thư mục vừa tải (`Dual-Subtitles-for-YouTube-Udemy`).

## Sử dụng

1. Mở một bài giảng Udemy hoặc một video YouTube.
2. Bật **phụ đề tiếng gốc** bằng nút **CC** của trình phát.
3. Bản dịch hiện ngay dưới phụ đề gốc.

Bấm biểu tượng extension trên thanh công cụ để:

- bật hoặc tắt,
- chọn ngôn ngữ dịch,
- chỉnh vị trí, cỡ chữ, màu, nền của bản dịch,
- chỉ hiện bản dịch (ẩn phụ đề gốc),
- mở sổ từ vựng.

> **Mẹo YouTube:** phụ đề tự động hiện từng cụm chữ, nên bản dịch đi theo câu đang nói chứ không theo từng chữ. Video có phụ đề do người tải lên sẽ khớp từng câu chính xác hơn.

## Cách hoạt động

```text
Trình phát tải file phụ đề (Udemy: .vtt · YouTube: /api/timedtext json3 hoặc XML)
        │  capture.js chạy trong trang, đọc bản sao phản hồi, không sửa gì
        ▼
content.js đọc thành các câu (thời gian, nội dung)
        │
        ▼
background.js dịch theo lô ──► 1. translate.googleapis.com
        │                       2. dự phòng: clients5.google.com
        │                       lưu vào chrome.storage.local
        ▼
content.js chèn bản dịch dưới dòng phụ đề trình phát đang hiện:
ghép theo nội dung câu, không khớp thì lấy câu đang phát theo thời gian video.
```

## Cấu trúc dự án

| File | Vai trò |
|---|---|
| `manifest.json` | Khai báo extension (Manifest V3) |
| `_locales/` | Tên và mô tả tiếng Anh, tiếng Việt (hiện theo ngôn ngữ trình duyệt và cửa hàng) |
| `capture.js` | Chạy trong trang từ lúc tải: chuyển nội dung file phụ đề cho `content.js` |
| `content.js` | Đọc WebVTT và timedtext, gửi dịch, chèn bản dịch; cấu hình riêng từng trang ở mảng `SITES` |
| `background.js` | Chia lô, gọi các nguồn dịch, thử lại, bộ nhớ đệm |
| `settings.js` | Giá trị cài đặt mặc định |
| `popup.html`, `popup.js` | Cài đặt |
| `vocabulary.html`, `vocabulary.js` | Sổ từ vựng |
| `subtitles.css` | Giao diện dòng dịch |
| `icons/` | Icon; `icon.svg` là bản thiết kế gốc |
| `scripts/make_icons.py` | Vẽ lại icon PNG từ thiết kế, không cần thư viện ảnh |
| `scripts/package.sh` | Đóng gói `dist/dual-subtitles-translator-<phiên bản>.zip` để nộp Chrome Web Store hoặc Edge Add-ons |

## Phát triển

- Sửa code, bấm **Reload** trên thẻ extension ở trang extensions, rồi tải lại trang video.
- Lỗi phần dịch: link **service worker** trên thẻ extension. Lỗi phần hiển thị: DevTools của tab video.
- **Thêm ngôn ngữ:** thêm một dòng `<option value="mã">` trong `popup.html`, mã theo Google Translate (`de`, `es`, `th`, `id`…).
- **Thêm trang web:** thêm `{ host, caption }` vào `SITES` trong `content.js` (bộ chọn CSS của dòng phụ đề trình phát), thêm tên miền vào `content_scripts.matches` trong `manifest.json`. Nếu trang dùng định dạng phụ đề khác, thêm bộ đọc trong `parseSubtitles`.
- **Thêm nguồn dịch:** viết hàm `(lines, lang) => Promise<string[]>` trả về đúng số dòng, thêm vào `PROVIDERS` trong `background.js`.
- **Đóng gói:** `./scripts/package.sh`.

Góp code: fork, tạo nhánh, mở pull request. Báo lỗi hoặc đề xuất: mở [issue](https://github.com/ledtudev/Dual-Subtitles-for-YouTube-Udemy/issues), kèm trang web, link video và ảnh màn hình nếu được.

## Lưu ý

- Hai nguồn dịch là endpoint miễn phí, **không chính thức** của Google. Trong thực tế chúng ổn định, nhưng Google có thể thay đổi bất cứ lúc nào. Cần độ ổn định cam kết thì thêm một nguồn có API key (Google Cloud Translation, DeepL) theo hướng dẫn ở trên.
- Dual Subtitles không liên kết với Udemy, YouTube hay Google.

## Tác giả

Làm bởi **[muckhotieu](https://github.com/ledtudev)**. Phát hành theo giấy phép [MIT](LICENSE): dùng, sửa, chia sẻ tự do, kể cả cho mục đích thương mại.

---

<details>
<summary><b>English</b></summary>

**Dual Subtitles & Translator** shows bilingual subtitles on **Udemy** and **YouTube**: the player's original caption on top, the translation right below. Free, unlimited, no account or API key.

- Translates the whole subtitle file as soon as the player loads it, in batches (about 6 requests for 400 lines), with a fallback provider and a persistent cache of 20 000 lines.
- Udemy WebVTT and YouTube timedtext (json3, XML), including auto-generated captions.
- No server of its own and no tracking: subtitle lines go to Google's translation service only.

**Install:** download or clone this repository, open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and pick the folder. Turn on the player's **CC** and choose the target language from the extension popup.

MIT licensed, made by [muckhotieu](https://github.com/ledtudev).
</details>
