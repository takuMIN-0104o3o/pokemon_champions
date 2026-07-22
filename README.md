# Pokemon Champions Battle Assistant（Web版）

元リポジトリ（Nekoruka96/PokemonChampions_Battle-assistant-tool）を、
Python(FastAPI)バックエンド不要の **完全静的サイト** に変換したものです。
`.bat`を実行してローカルサーバーを立てる必要はなく、このフォルダをどこかにアップロードするだけで動きます。

## 何を変えたか

- 元は `backend/server.py`（FastAPI）が `/api/pokemon` 等のエンドポイントを提供し、
  `frontend`がそれを叩く構成でした。
- 今回はそれらのAPIレスポンスを**あらかじめ計算してJSONファイル化**し（`data/`フォルダ）、
  `main.js` / `master.js` がバックエンドの代わりにこの静的JSONを読み込むように書き換えています。
- 「採用フラグの切り替え」「CSVインポート」など、元は**サーバー側のファイルに書き込んでいた**機能は、
  **ブラウザのlocalStorage**に保存する方式に変更しました（ブラウザ・端末ごとに保存されます。全員で共有はされません）。

## ローカルで確認する

Python等がインストールされていれば、このフォルダ内で：

```bash
python3 -m http.server 8000
```

を実行し、ブラウザで `http://localhost:8000` を開いてください。
（`file://`で直接HTMLを開くとJSONの読み込みがブロックされるため、必ず簡易サーバー経由で開いてください）

## 無料でWebに公開する方法（おすすめ: Cloudflare Pages / Netlify / Vercel）

このフォルダをそのままドラッグ&ドロップするだけで公開できます。

### Netlifyの場合
1. https://app.netlify.com/drop を開く
2. `pokemon-champions-web` フォルダをブラウザにドラッグ&ドロップ
3. 発行されたURLでアクセス可能に

### GitHub Pagesの場合
1. GitHubで新しいリポジトリを作成し、このフォルダの中身をすべてpush
2. リポジトリの Settings → Pages → Branch を `main` / `root` に設定
3. `https://<ユーザー名>.github.io/<リポジトリ名>/` でアクセス可能に

## iPhoneでアプリ化する（PWA / ホーム画面に追加）

このサイトはPWA（Progressive Web App）対応済みです。以下の手順でiPhoneのホーム画面にアプリとして追加でき、
ホーム画面から起動するとアドレスバー無しのアプリのような見た目・動作になります。

1. 上記のいずれかの方法（Netlify Drop / GitHub Pages 等）で **https:// のURLとして公開する**
   （`file://` や `http://localhost` からは正しくインストールできません）
2. iPhoneの **Safari** でそのURLを開く（Chrome等ではホーム画面追加のPWA対応が弱いため必ずSafariを使用）
3. 画面下の「共有」ボタン（□に↑）をタップ
4. 「ホーム画面に追加」を選択 → 名前を確認して「追加」
5. ホーム画面にアイコンが追加され、タップするとアプリのようにフルスクリーンで起動します

一度開いた後は、`data/`フォルダのJSONやアプリ本体がService Workerによって端末内にキャッシュされるため、
2回目以降は電波が弱い場所でもある程度動作します（ただしポケモンの画像は`raw.githubusercontent.com`から
読み込むため、画像表示には引き続きインターネット接続が必要です）。

## 制限事項・注意点

- 採用フラグ・CSVインポートで登録したデータは**あなたのブラウザにのみ保存**され、他の人とは共有されません
  （複数人で共有したい場合は、別途Supabase等のバックエンドDBを追加する必要があります）
- 画像（ポケモンのスプライト）は `raw.githubusercontent.com` から読み込んでいるため、インターネット接続が必要です
- 本ツールはファンメイドであり、任天堂・クリーチャーズ・ゲームフリークとは無関係です（元リポジトリのREADMEより）
