# 砂漠に種を蒔く ― 開発指示書（Claude Code 用）

## このプロジェクトについて

「砂漠に種を蒔く」は、生きづらさを「種」として蒔き、誰かがやさしい言葉の手紙で水をあげ、蒔いた人が「ありがとう」を返すと花が咲く Web アプリ。
花が咲くと砂漠が緑になり、緑が広がるほど砂嵐が退いて、世界が少しずつひらけていく。
「生きづらさという砂漠を、みんなで少しずつ生きやすくしていく」ことがこのアプリの世界観。

`prototype/index.html` は、完成形の見た目と文言を持つ試作版（1ファイル・localStorage 保存）。
これを **Firebase（匿名ログイン＋Firestore）を使った公開版** にするのがこのプロジェクトの目的。

---

## いちばん大事なルール

1. **文言は一字一句変えない。**
   おばあちゃんのセリフ（`TALK` / `TUT`）、おばあちゃんの種（`GRANNY_SEED`）、ボタン、ラベル、プレースホルダー、トースト、説明シート、相談窓口一覧（`contactsHTML`）は、`prototype/index.html` の文字列をそのまま使う。句読点・改行・全角スペースも含めて同じにする。
2. **デザインは変えない。**
   色・フォント（Zen Maru Gothic）・余白・角丸・アニメーション・Canvas の描画（砂、風紋、緑、草、家、焚き火、おばあちゃん、花、嵐、夜の闇と光、蛍）はすべて試作版と同じ見た目にする。
3. 新しい文言や UI が必要になったとき（エラー表示、読み込み中など）は、**勝手に作らず、先に案を出して私に確認する**。
4. リファクタリング（ファイル分割、モジュール化）はしてよいが、見た目と挙動が変わらないことを毎回スクリーンショットで確認する。比較には Playwright を使い、iPhone サイズ（390×780, DPR2）で、昼・夜・会話シート・種シートを撮る。
5. 各フェーズの終わりで作業を止め、何をしたか・何を確認したかを報告して、私の OK を待つ。

---

## 技術構成

- フロント：Vite ＋ Vanilla JavaScript（Canvas 描画は試作版のコードを移植する）
- Firebase JS SDK v10 以降（モジュラー API）
  - Authentication：**匿名ログインのみ**
  - Cloud Firestore
- **Cloud Functions は使わない**（無料の Spark プランで動かす）
- ホスティング：Vercel
- Firebase の設定値は `.env` に置き、`VITE_FIREBASE_*` で読む。`.env` は Git に入れない。`.env.example` を用意する。
- Firestore セキュリティルールは `firestore.rules` で管理し、Firebase Emulator でテストする。

---

## 世界のしくみ（公開版の仕様）

### 1人に1つの世界
- プレイヤーはそれぞれ、自分だけの世界（100×100 マス）を持つ。他のプレイヤーの姿は見えない。
- 世界のまんなかに「はじまりの村」（家・焚き火・茂み・おばあちゃん）がある。地形と飾りは乱数シード固定で全員同じ。
- おばあちゃんはコンピュータのキャラクターで、全員の世界にいる。

### 緑と嵐（試作版と同じ）
- 村のまわり（半径 3.6 マス）は緑。村の中心部（半径 2.6 マス）には種を蒔けない。
- 花が咲いたマスと、そのまわり 8 マス（3×3）が緑になる。
- 緑から 10 マスより離れたマスは砂嵐で、進めない。
- 緑と嵐は、**自分の世界にある花** からクライアント側で計算する（`rebuildWorld()` を流用）。

### 種を蒔く
- 種は **緑の上にだけ** 蒔ける。1 マスに種は 1 つまで。
- 書く内容：①抱えている生きづらさ（2 行・60 字まで）、②それにどう向き合っているか（8 行・240 字まで）。
- 蒔いた種は、まず自分の世界の、自分が立っているマスに植わる。
- さらに、**ほかのプレイヤー 5 人の世界** に届く（下の「配達」を参照）。

### 種の配達（5 つの世界へ）
Cloud Functions を使わず、「アプリを開いた人が、届いていない種を受け取りにいく」方式にする。

1. アプリを開いたとき（と、開いている間は数分おき）に、まだ届け先が 5 未満の公開中の種を、古い順に少しずつ取得する。
2. 自分が蒔いた種、すでに自分に届いている種は除く。
3. 1 つずつ **トランザクション** で受け取る：
   - 種の `deliveredCount` を +1、`deliveredTo` に自分の uid を追加、5 に達したら `open=false`。
   - 同じトランザクションで、自分の世界の **ランダムな空いている緑のマス**（村の中心部・既存の種・飾りのマスを除く）に配置記録を作る。
4. 空いている緑のマスがなければ、その種は受け取らない（次の機会に回す）。
5. 1 日に受け取る数の上限は設定値にする（初期値は「未決事項」参照）。

### 水やり（手紙）
- 水やりできるのは、**自分の世界にある種だけ**（届いた種と、自分の種）。
- **1 つの種に 1 人 1 回だけ**。手紙ドキュメントの ID を書いた人の uid にすることで、ルール上 2 通目を作れないようにする。
- 自分の種には、自分で手紙を書ける（「自分に、手紙を書く」）。
- 手紙は 10 行・300 字まで。
- 手紙を読めるのは、**種を蒔いた人と、その手紙を書いた人だけ**。

### ありがとうと花
- 蒔いた人は、届いた手紙ごとに「ありがとう」を返せる（取り消しはできない）。
- 花が咲く世界：
  - **蒔いた人の世界**：その種の手紙のどれか 1 通にありがとうを返したとき。
  - **水をあげた人の世界**：自分の手紙にありがとうが返ってきたとき。
- 1 マスに咲く花は 1 輪だけ（ありがとうの数は花の数に反映しない）。
- 状態の見え方は試作版と同じ：手紙がなければ「種」、手紙があれば「芽」、ありがとうがあれば「花」。
- 「わたしの種」の点（未読マーク）：自分の種に新しい手紙が届いたとき／自分の手紙にありがとうが返ってきたとき。

### 初回講習（試作版と同じ流れ）
- 講習の進み具合 `tutorial`（0〜3）はユーザードキュメントに保存する。
- 0：おばあちゃんと話す → 1：おばあちゃんの種へ案内（矢印と光）→ 2：手紙を送ると、おばあちゃんが読んでありがとうを返し、花が咲く → 3：「こんどは、あんたの番だ」で完了。
- 講習が終わるまで、種を蒔くことも、ほかの種への水やりもできない（ボタン表示も試作版と同じ）。
- **おばあちゃんの種は全員の世界に同じものがある固定の種**。Firestore の `seeds` には入れない。おばあちゃんへの手紙は、ユーザードキュメントの `grannyLetter` に保存するだけで、誰にも送られない。

### 夜
- 端末の時刻で 18 時〜翌 6 時は夜。☾／☀ ボタンで切り替えられる（試作版と同じ）。

---

## 安全のしくみ

- 種の本文に危機的な言葉（試作版の `CRISIS` 正規表現）が含まれたら、`status: 'hidden'` で保存し、ほかの世界には配達しない。蒔いた本人には試作版と同じ相談先シートを出す。
- 管理者は Firebase コンソールで、どの種でも `status` を `hidden` にできる。hidden の種は、ほかの人の世界から見えなくなる（蒔いた本人の世界には残る）。
- 名前や連絡先は一切保存しない。匿名 uid だけを使う。
- 推奨：Firebase App Check（reCAPTCHA）を有効にして、スクリプトからの大量投稿を防ぐ。
- 注意：匿名ログインのため、ブラウザのデータを消すと自分の世界にもう戻れない。将来、引き継ぎ（メールや Apple ID の連携）を検討する。

---

## データモデル（Firestore）

```
users/{uid}
  createdAt       timestamp
  tutorial        number (0..3)
  metGranny       bool
  introSeen       bool
  grannyLetter    string | null   // おばあちゃんへの手紙（誰にも送られない）
  receivedToday   number          // 1日の受け取り数カウント
  receivedDate    string          // 'YYYY-MM-DD'

seeds/{seedId}
  ownerUid        string
  h               string (<=60)    // ① 生きづらさ
  f               string (<=240)   // ② 向き合い方
  flower          number (0..4)    // 花の種類
  createdAt       timestamp
  status          'public' | 'hidden'
  open            bool             // まだ配達先を受け付けているか
  deliveredCount  number (0..5)
  deliveredTo     array<uid>

seeds/{seedId}/letters/{writerUid}   // ドキュメントID＝書いた人の uid（1人1回）
  writerUid       string
  text            string (<=300)
  createdAt       timestamp
  thanked         bool
  thankedAt       timestamp | null

worlds/{uid}/tiles/{seedId}          // その人の世界のどのマスに、どの種があるか
  seedId          string
  x, y            number
  kind            'own' | 'received'
  placedAt        timestamp
```

必要な複合インデックス：`seeds` の `status ==`, `open ==`, `createdAt asc`。

---

## セキュリティルールの下書き

下書きなので、**必ず Emulator でテストを書いて検証し、穴があれば直す**こと。

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function signedIn() { return request.auth != null; }
    function me() { return request.auth.uid; }

    match /users/{uid} {
      allow read, create, update: if signedIn() && me() == uid;
      allow delete: if false;
    }

    match /worlds/{uid}/tiles/{seedId} {
      allow read: if signedIn() && me() == uid;
      allow create: if signedIn() && me() == uid
        && request.resource.data.keys().hasOnly(['seedId','x','y','kind','placedAt'])
        && request.resource.data.seedId == seedId
        && (
          (request.resource.data.kind == 'own'
            && getAfter(/databases/$(db)/documents/seeds/$(seedId)).data.ownerUid == uid)
          ||
          (request.resource.data.kind == 'received'
            && uid in getAfter(/databases/$(db)/documents/seeds/$(seedId)).data.deliveredTo)
        );
      allow update, delete: if false;
    }

    match /seeds/{seedId} {
      allow read: if signedIn()
        && (resource.data.status == 'public' || resource.data.ownerUid == me());

      allow create: if signedIn()
        && request.resource.data.ownerUid == me()
        && request.resource.data.h is string && request.resource.data.h.size() > 0 && request.resource.data.h.size() <= 60
        && request.resource.data.f is string && request.resource.data.f.size() > 0 && request.resource.data.f.size() <= 240
        && request.resource.data.status in ['public', 'hidden']
        && request.resource.data.deliveredCount == 0
        && request.resource.data.deliveredTo.size() == 0
        && request.resource.data.open == (request.resource.data.status == 'public');

      // 配達：ほかの人が、自分の分の枠を 1 つ受け取る
      allow update: if signedIn()
        && resource.data.ownerUid != me()
        && resource.data.status == 'public'
        && resource.data.open == true
        && !(me() in resource.data.deliveredTo)
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['deliveredCount','deliveredTo','open'])
        && request.resource.data.deliveredCount == resource.data.deliveredCount + 1
        && request.resource.data.deliveredTo == resource.data.deliveredTo.concat([me()])
        && request.resource.data.open == (request.resource.data.deliveredCount < 5);

      allow delete: if false;

      match /letters/{writer} {
        function seed() { return get(/databases/$(db)/documents/seeds/$(seedId)).data; }

        allow read: if signedIn() && (me() == writer || seed().ownerUid == me());

        allow create: if signedIn() && me() == writer
          && (seed().ownerUid == me()
              || exists(/databases/$(db)/documents/worlds/$(me())/tiles/$(seedId)))
          && request.resource.data.keys().hasOnly(['writerUid','text','createdAt','thanked','thankedAt'])
          && request.resource.data.writerUid == me()
          && request.resource.data.thanked == false
          && request.resource.data.text is string
          && request.resource.data.text.size() > 0 && request.resource.data.text.size() <= 300;

        // ありがとう：蒔いた人だけが、false → true にできる
        allow update: if signedIn() && seed().ownerUid == me()
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['thanked','thankedAt'])
          && resource.data.thanked == false
          && request.resource.data.thanked == true;

        allow delete: if false;
      }
    }
  }
}
```

---

## 試作版から変える・消すもの

- `localStorage` での保存 → Firestore に置き換える。
- **架空の村人の自動処理は削除**：`DEMO_LETTERS` と `tickDemo()`（20 秒後に届く架空の手紙、9 秒後に返る架空のありがとう）。
- 見本の種 `SAMPLES`（8 つ）の扱いは「未決事項」を参照。決まるまでは消さずにフラグで切り替えられるようにしておく。
- 説明シートの「【試作版】」の注意書きと「データを消す」ボタンは、公開版での扱いを私に確認する。
- それ以外のコード（描画、会話、シート、行数制限、危機ワード検知、相談先一覧）は、そのまま移植する。

---

## 進め方（フェーズ）

1. **移植**：Vite プロジェクトを作り、`prototype/index.html` をそのまま動かす。HTML / CSS / JS をファイルに分けてもよいが、見た目が完全に同じことをスクリーンショットで確認する。
2. **Firebase 接続**：匿名ログイン、`users/{uid}` の作成・読み込み。講習の進み具合と、説明を見たかどうかを Firestore に保存する。
3. **種を蒔く**：`seeds` と `worlds/{uid}/tiles` への保存。自分の世界の読み込み。
4. **配達**：5 つの世界へのトランザクション配達と、ランダムなマスへの配置。
5. **水やりとありがとう**：手紙、ありがとう、花、未読マーク。
6. **ルールとテスト**：`firestore.rules` と Emulator テスト（下の受け入れ条件をすべて満たす）。
7. **公開**：Vercel にデプロイし、Firebase の承認済みドメインを設定する。

---

## 受け入れ条件

- テスト用に 6 アカウントを作り、A が蒔いた種が、A 以外のちょうど 5 つの世界に届き、6 つ目には届かない。
- 同じ人が同じ種に 2 通目の手紙を書こうとすると、ルールで拒否される。
- 自分の世界にない種に手紙を書こうとすると、ルールで拒否される。
- 他人の手紙は、蒔いた人と書いた人以外には読めない。
- ありがとうを返せるのは蒔いた人だけで、取り消せない。
- `status: 'hidden'` の種は配達されず、ほかの人の世界から見えない。
- 初回講習が試作版と同じ流れで進み、途中でページを再読み込みしても続きから再開できる。
- 試作版と並べたスクリーンショットで、見た目に違いがない（昼・夜・嵐・会話・種シート）。

---

## 未決事項（実装前に私に確認すること）

- 見本の種 8 つ：公開版で消すか、全員の世界に最初から置いておくか（置く場合、水やりした手紙はどこに届くか）。
- 1 日に受け取る種の数の上限（案：3 つ）。
- 利用者が少なくて、届け先が 5 人に満たない種の扱い。
- 種・芽・花が時間で消える仕様を入れるか。
- 通報ボタンを付けるか（付ける場合の文言）。
- 公開する URL（例：kitsuonmura.com 配下か、別ドメインか）。
