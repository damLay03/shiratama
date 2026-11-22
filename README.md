# shiratama 白玉

App luyện thi JLPT và ôn thẻ của riêng mình. Linh vật là bé shiratama do Na vẽ.

**Mở app:** https://damlay03.github.io/shiratama/

- Luyện đề N3: thi thật có bấm giờ, luyện từng câu, mỗi câu có giải thích vì sao đúng và vì sao từng đáp án còn lại sai.
- Sổ câu sai: câu làm sai hoặc đoán mò tự quay lại theo lịch FSRS.
- Ôn thẻ thay Anki: nhập file `.apkg`, giữ nguyên lịch ôn và độ nhớ của từng thẻ.
- Tiến độ lưu trong máy, có sao lưu và khôi phục bằng file.

Nội dung đề thi có bản quyền nên chỉ được lưu dưới dạng mã hóa (`data/*.enc.json`), cần mã để mở. Âm thanh phần nghe phát trực tiếp từ jlpt.jp.

## Ghi công

- Đề thi: 日本語能力試験 公式問題集 第二集 (jlpt.jp), dùng cho mục đích học cá nhân.
- Thuật toán ôn tập: [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) (MIT).
- Đọc file Anki: [sql.js](https://github.com/sql-js/sql.js) (MIT), [JSZip](https://stuk.github.io/jszip/) (MIT), [fzstd](https://github.com/101arrowz/fzstd) (MIT).
- Tranh bé shiratama: Na vẽ.
