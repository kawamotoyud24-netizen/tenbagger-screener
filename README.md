# テンバガースクリーナー

BCU Working Paper (2025) × 清原ネットキャッシュ戦略をもとにしたスクリーニングアプリ。

## デプロイ手順

### 1. GitHubにリポジトリ作成
1. https://github.com/new にアクセス
2. リポジトリ名: `tenbagger-screener`
3. Public or Private どちらでもOK
4. 「Create repository」をクリック

### 2. ファイルをアップロード
GitHubの画面で「uploading an existing file」をクリックし、
このフォルダの中身をすべてドラッグ＆ドロップ。
その後「Commit changes」をクリック。

### 3. Vercelにデプロイ
1. https://vercel.com にアクセス（GitHubアカウントでログイン）
2. 「Add New Project」→ `tenbagger-screener` を選択
3. 「Environment Variables」に以下を追加:
   - Name: `FMP_API_KEY`
   - Value: あなたのFMP APIキー
4. 「Deploy」をクリック

### 4. スマホのホーム画面に追加
デプロイ完了後、発行されたURLをSafariで開き
「共有」→「ホーム画面に追加」でアプリ感覚で使えます。

## 判定条件

### BCU論文条件（Birmingham City University, 2025）
- ★ FCF利回り ≥ 5%
- ★ ROE ≥ 10%
- ★ PBR ≤ 2.5
- FCFマージン ≥ 8%
- EBITDAプラス成長
- 52週安値圏（+40%以内）

### 清原ネットキャッシュ条件
- ★ PBR ≤ 1.0
- ★ PER ≤ 10
- 時価総額 ≤ $500M
- ★ ネットキャッシュ比率 ≥ 1.0
  （= (流動資産 + 投資有価証券×70% − 負債) ÷ 時価総額）

## 免責事項
本アプリはBCU Working Paper（査読前）をもとにした私案です。
投資判断はご自身の責任でお願いします。
