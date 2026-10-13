# MITORI Initial Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 承認済みの5ページの初回案内と9項目の手動TODOを、公開済みv0.4.0の機能と保存データを保ったまま組み込む。

**Architecture:** ガイドの文章、手動チェックのモデル、独立した保存、表示、入力保護付きの画面移動を分ける。本体の各画面とは独立した表示領域を使い、既存画面と保存関数には必要な接続だけを追加する。レポートの集計・個票・出力処理は変更しない。

**Tech Stack:** 既存のHTML、CSS、JavaScriptとブラウザのlocalStorage。モジュールは既存のreport-model.js等と同じブラウザグローバル兼CommonJS方式とし、Node.js標準のnode:testで検証する。外部ライブラリ、ビルド工程、アクセス解析は追加しない。

**Spec:** [初回案内とフローティングTODOの承認済み仕様](../specs/2026-10-13-initial-guide-design.md)

## Global Constraints

- フローティングTODOは常に1つだけ表示する。
- 本体の画面、モード、設定画面を切り替えても閉じない。
- TODOの「×」で閉じるまで表示を維持する。全項目をチェックしても自動で閉じない。
- どの項目も手動でチェックでき、順番を強制せず、チェックを外すこともできる。
- 説明に登場する画面名と、右端の移動ボタン名を合わせる。
- TODOのチェックは端末内で本体データと分離し、全体バックアップには含めない。
- 「保存して移動」「編集を続ける」を用意し、保存失敗時は入力を残して移動しない。
- 授業記録の確定、授業時数の計上、時間割の「実行」、評価の確定、削除、復元は移動のために自動実行しない。
- 標準幅は400 CSSピクセルを目安とし、画面の左右に12ピクセル以上の余白を残す。
- 標準の高さは最大560 CSSピクセル、通常は利用可能な画面高さの80%以下とする。
- ソフトウェアキーボード表示時も、その時点で見える範囲を優先する。
- 既存ユーザーの更新時やデータ移行時は初回の案内カードを自動表示しない。
- ガイド表示、チェック、閉じる、位置変更だけではMITORI本体のstateを変更しない。
- sources/は参照専用。既存の名簿、授業記録、チェック表の保存形式、バックアップ形式は変更しない。
- 今回は初回設定だけを実装する。未作成の目的別ガイドや、未承認の追加設定項目は表示しない。
- 公開サイトへの反映、push、リリース作成はこの計画の実行に含めない。まずローカルで実装と検証を終える。

## Review Focus

1. ローカル保存が拒否される、容量不足になる、ガイド情報だけが壊れる場合も、本体データに触れず保存できないことを伝える。Task 2とTask 4で検証する。
2. 本体の保存キーがなくてもチェック表だけに既存データが残っている場合、初回案内を自動表示しない。Task 6で検証する。
3. 順不同のチェックで先頭へ戻る場合も、直前のチェックを見失わず、チェックしたコントロールのフォーカスを失わない。Task 1、Task 3、Task 5で検証する。
4. iPadのキーボード、縦横切替、古い保存位置によってパネルが見える範囲から消えない。Task 2、Task 5で検証する。
5. 複数の未保存編集が残っている、移動ボタンを続けて押す、確認をキャンセルする場合、一部だけを保存して別の入力を失わない。Task 4で検証する。

## 実装の基準と確認済みの事項

2026-10-14の確認時点で、GitHub mainと手元のHEADは `fd1a1a7fe35074bd42e728655cd4de453f1a9503` で一致する。index.htmlのファイル識別子は `8127dd7fbba690e335b82013c6cafa9738d91959`、APP_VERSIONは0.4.0である。既存の `node --test` は52件すべて成功した。

学年、教科、共有クラス、名簿、授業タイル、時間割、学期と休業日、反映開始日の画面名と基本操作は、承認済みの仕様に対応している。5ページと9項目の内容を変更する必要はない。

新版では「ホーム」ボタンが現在のモードに応じてレポート等へ戻るため、授業ボードへのガイド移動では `setMode('record')` を使う。単に既存ホームボタンを押す実装にはしない。

本体の保存キーは `MITORI_V033_SETTINGS_LAYOUT_SYNC` のまま維持する。既存レポートの4モジュール、backup.js、記録時氏名の保存仕様は変更しない。変更が必要な既存レポートテストは、最終タスクの表示バージョン確認1件だけとする。

実行開始前に `superpowers:using-git-worktrees` に従い、既存の適切な作業場所を再利用するか、隔離した作業場所を確保する。作業開始時の最新版と未コミット変更を再確認する。この計画内のファイルパスは、実装用リポジトリのルートからの相対パスである。

## ファイル構成と責務

| ファイル | 責務 |
| --- | --- |
| guide-content.js | 5ページと9項目の文章、安定した識別子、移動先 |
| guide-model.js | 手動チェックと説明開閉の状態、次の未チェック、スクロールと位置の計算 |
| guide-storage.js | 専用キーによる保存、読み込み、ガイド単位のリセット、保存エラー |
| guide-navigation.js | 未保存入力の確認、保存成功後だけの移動、連打の防止 |
| guide-app.js | ガイドの操作を受け取り、モデル、保存、表示、移動を接続する |
| guide-view.js | 独立した案内と単一TODOのDOM、フォーカス、ドラッグ、サイズ補正 |
| guide.css | ガイドに限定した配色、レイアウト、重なり、印刷時の非表示 |
| index.html | ヘッダーの入口、ガイドの共通領域、既存保存と移動への接続 |
| checklist/app.js | 初期保存の有無と未保存編集についての読み取り専用の接続 |
| sw.js | 新規ファイルと更新したファイルのキャッシュ整合性 |
| tests/guide-*.test.cjs | 純粋モデル、保存、操作、移動、安全性、組み込み条件の検証 |
| tests/guide-ui-harness.html | 実アプリのデータを使わない、ブラウザでの表示と操作確認 |

## 共通の型と接続

`Guide` は `{id, title, intro, steps}`。`intro` は5ページの配列、`steps` は `{id, title, jumpLabel, target, description, procedures, notes}` の9項目の配列とする。タイトルと説明は仕様書に合わせ、可変のクラス名や児童名は含めない。

`GuideTarget` は `{kind:'settings', pane, focus?}`、`{kind:'roster'}`、`{kind:'board'}` のいずれか。`pane` は `grade`、`subject`、`sharedClass`、`class`、`timetable`、`term`、`backup` の許可済み値に限定する。名簿の対象クラスは移動時に選び、ガイド保存には記録しない。

`TodoSession` は `{checks, expandedIds, lastCompletedId}`。チェックは項目識別子から真偽値への対応、開いている説明は識別子の配列、直前に完了した項目は識別子またはnullとする。説明開閉と直前の完了はその表示中の状態であり、永続保存しない。

`GuideSnapshot` は `{checks, started, introPage, visible, activeGuideId, position, noticeShown, persistent}`。`position` は `{x,y}` またはnull。保存形式には版1を付ける。`persistent:false` は保存を保証できない状態であり、画面へ警告を表示する。

`PendingEditor` は `{id,label,kind}`、`kind` は `saveable` または `manual`。`GuideHost` は `inspectEditors(target): PendingEditor[]|Promise<PendingEditor[]>`、`confirmSave(editor): Promise<boolean>`、`saveEditor(editor): boolean|Promise<boolean>`、`openTarget(target): Promise<boolean>`、`notify(message): void` を持つ。移動モジュールへ実際の名簿や記録を渡さず、保存と移動は本体側の関数で行う。

`GuideViewState` は `{screen, guide, session, introPage, visible, position, persistent, reviewCompleted}`。`screen` は `none`、`menu`、`intro`、`todo` のいずれか。TODOが表示中にメニューや概要を開いても、パネルの表示状態を閉じた扱いにしない。

`GuideAction` はtypeに応じて必要な値を持つ。openとintroにはguideId、intro-pageには0から4のpage、checkにはstepIdとchecked、expandにはstepIdとopen、jumpにはstepId、positionにはpositionを渡す。menu、start、reset、close、review、backup、backup-laterは現在選択中のガイドに対する操作とする。backupは固定のバックアップ設定へ、jumpは現在のガイドに定義された移動先だけへ移動する。

---

### Task 1 ガイド内容と手動チェックのモデル

**Files:**

- Create: guide-content.js、guide-model.js
- Test: tests/guide-model.test.cjs

**Interfaces:**

- Produces: `MitoriGuideContent.GUIDES: Guide[]`、`getGuide(id:string): Guide|null`
- Produces: `MitoriGuideModel.createTodoSession(guide:Guide, checks:object): TodoSession`
- Produces: `setStepChecked(guide:Guide, session:TodoSession, id:string, checked:boolean): TodoSession`
- Produces: `setStepExpanded(guide:Guide, session:TodoSession, id:string, open:boolean): TodoSession`
- Produces: `countCompleted(guide:Guide, checks:object): number`

- [ ] **Step 1 テストを書く。** `initial guide has exactly five intro pages and nine stable steps` で5ページと9識別子、全移動ボタン名を仕様書の表と照合する。`manual checks close only their own explanation` では次を確認する。

```js
const guide = Content.getGuide('initial-setup');
const initial = Model.createTodoSession(guide, {});
assert.deepEqual(initial.expandedIds, ['grade']);
const manual = Model.setStepExpanded(guide, initial, 'class', true);
const checked = Model.setStepChecked(guide, manual, 'grade', true);
assert.equal(checked.checks.grade, true);
assert.equal(checked.lastCompletedId, 'grade');
assert.ok(!checked.expandedIds.includes('grade'));
assert.ok(checked.expandedIds.includes('subject'));
assert.ok(checked.expandedIds.includes('class'));
assert.equal(initial.checks.grade, false);
```

`later completed steps are skipped and the search wraps` は、最後の項目を先にチェックし、その次が先頭の未チェックであることを確認する。`undo opens the unchecked step without clearing other manual expansions`、`all-complete tracks the actual last click not the final step number`、`unknown step ids cannot change progress` も追加する。

- [ ] **Step 2** `node --test tests/guide-model.test.cjs` を実行し、新規モジュール未作成による失敗を確認する。
- [ ] **Step 3** 上記の関数を副作用のない処理として実装する。内容は仕様書の3節と4節から移す。名簿のプレビューが先頭の一部であることと、不完全な名簿で既存内容を更新しない注意を含める。全完了時は説明を自動で開かない。実アプリの状態は受け取らない。
- [ ] **Step 4** 同じテストを再実行し、すべてのテストが成功することを確認する。
- [ ] **Step 5** 上記2モジュールとテストだけを `feat: add initial guide content and manual progress model` としてコミットする。

### Task 2 本体と独立した保存と再開

**Files:**

- Create: guide-storage.js
- Test: tests/guide-storage.test.cjs

**Interfaces:**

- Consumes: Guide、GuideSnapshot
- Produces: `MitoriGuideStorage.createGuideStore({storage,onError}): GuideStore`
- Produces: `store.read(guide:Guide): GuideSnapshot`
- Produces: `store.saveProgress(guide:Guide, checks:object): boolean`
- Produces: `store.saveIntro(guideId:string, {started,introPage}): boolean`
- Produces: `store.saveUi({visible,activeGuideId,position}): boolean`
- Produces: `store.markNoticeShown(): boolean`、`store.reset(guide:Guide): boolean`
- Produces: `inspectStartupData(storage): 'fresh'|'existing'|'unknown'`

- [ ] **Step 1 テストを書く。** Mapを使うlocalStorage互換のテスト用オブジェクトをテストファイル内で用意する。`close reopen and another guide retain their own checks`、`new steps start unchecked without losing existing ids`、`reset does not change application storage or another guide`、`only three guide keys may be written` を検証する。

```js
const mainKey = 'MITORI_V033_SETTINGS_LAYOUT_SYNC';
storage.setItem(mainKey, '{"records":[{"memo":"既存記録"}]}');
const original = storage.getItem(mainKey);
const store = Storage.createGuideStore({storage, onError: () => {}});
assert.equal(store.saveProgress(guide, {grade:true}), true);
store.saveUi({visible:false, activeGuideId:guide.id, position:{x:12,y:80}});
assert.equal(store.read(guide).checks.grade, true);
assert.equal(store.read(guide).visible, false);
store.reset(guide);
assert.equal(store.read(guide).checks.grade, false);
assert.equal(storage.getItem(mainKey), original);
```

`storage access and quota failures preserve in-memory progress and warn` は、取得と書込みの例外を別々に与え、例外が漏れず `persistent:false` と警告が返ることを確認する。`corrupt guide data does not clear the entire origin` はclear/removeItemを呼ばないこと、正常な別ガイドを保持することを確認する。`non-finite positions become null` と、既存本体・バックアップのキーがある場合の `inspectStartupData` も検証する。

- [ ] **Step 2** `node --test tests/guide-storage.test.cjs` が新規モジュール未作成により失敗することを確認する。
- [ ] **Step 3** 専用キー `MITORI_GUIDE_PROGRESS_V1`、`MITORI_GUIDE_UI_V1`、`MITORI_GUIDE_NOTICE_V1` を実装する。入力を許可済みフィールドへ絞り、保存失敗時もメモリ上の操作を継続する。未知の形式を本体データの初期化で処理しない。起動時判定はMITORI_で始まる本体側のキーを読み取り、MITORI_GUIDE_は除外する。読取拒否ならunknownとする。
- [ ] **Step 4** Task 1とTask 2のテストを実行し、すべて成功することを確認する。
- [ ] **Step 5** モジュールとテストを `feat: persist guide progress separately from app data` としてコミットする。

### Task 3 概要説明と単一TODOの表示

**Files:**

- Create: guide-app.js、guide-view.js、guide.css
- Create: tests/guide-ui-harness.html
- Test: tests/guide-app.test.cjs、tests/guide-ui-contract.test.cjs

**Interfaces:**

- Consumes: Task 1のモデル、Task 2のGuideStore
- Produces: `MitoriGuideApp.createGuideController({catalog,store,navigate,view}): GuideController`
- Produces: `controller.dispatch(action:GuideAction): Promise<void>`、`controller.restore(): void`
- Produces: `MitoriGuideView.createGuideView({document,window,root,onAction}): GuideView`
- Produces: `view.patch(state:GuideViewState): void`、`view.showNotice(): void`、`view.destroy(): void`
- Produces: `view.confirm(message:string, {acceptLabel,cancelLabel}): Promise<boolean>`、`view.chooseClass(classes:Array<{id,label}>): Promise<string|null>`、`view.notify(message:string): void`
- `GuideAction.type` はmenu、open、intro、intro-page、start、check、expand、reset、close、jump、review、backup、backup-later、positionとする。値は共通の型と接続の定義に従う。

- [ ] **Step 1 テストを書く。** 偽のviewに渡された状態と偽のnavigateへの呼出しを記録する。`starting intro displays no todo until start`、`started guides reopen directly as todo`、`close preserves checks and reload respects visibility`、`switching guides uses one view and keeps progress`、`checking alone never navigates or saves app state` を確認する。

```js
await controller.dispatch({type:'open', guideId:'initial-setup'});
assert.equal(viewStates.at(-1).screen, 'intro');
await controller.dispatch({type:'start', guideId:'initial-setup'});
assert.equal(viewStates.at(-1).screen, 'todo');
await controller.dispatch({type:'check', stepId:'grade', checked:true});
assert.equal(viewStates.at(-1).session.checks.grade, true);
assert.deepEqual(navigationCalls, []);
await controller.dispatch({type:'close'});
assert.equal(store.read(guide).visible, false);
assert.equal(store.read(guide).checks.grade, true);
```

`completion keeps the panel visible and backup is navigation only` は、9チェック後もvisibleであること、backup-laterがチェックを戻さないこと、backup操作だけがバックアップ設定への移動を呼ぶことを確認する。`cancelled reset preserves progress` はリセット確認のキャンセルでチェックが変わらないことを確認する。`reviewing intro preserves started status and progress` は概要の再閲覧で開始済み状態とチェックを変えないことを確認する。`unknown restored guide opens nothing and preserves stored progress` では、削除済み・未知のガイドを復元しようとしても本体を妨げないことを確認する。保存警告時には通常の再開保証文だけを表示しないことを契約テストで確認する。

- [ ] **Step 2** `node --test tests/guide-app.test.cjs tests/guide-ui-contract.test.cjs` の失敗を確認する。
- [ ] **Step 3** コントローラーと表示を実装する。`mitoriGuideRoot` の下に `mitoriGuideMenu`、`mitoriGuideIntro`、`mitoriGuidePanel`、`mitoriGuideNotice`、`mitoriGuideConfirm`、`mitoriGuideClassPicker` を1つずつ用意する。チェック更新では行のDOMを破棄せず、checkbox、details、進捗だけを更新する。手動の説明開閉をdispatchへ渡す。チェック済み行の再確認、完了後の手順確認、リセット確認、概要への戻り方を仕様に合わせる。confirmとchooseClassはこの独立した表示内で解決し、本体の再描画を呼ばない。
- [ ] **Step 4** 概要とメニューには操作元へのフォーカス復帰を設け、TODOにはフォーカスの閉じ込めやEscによる自動終了を設けない。背景遮蔽は概要・メニュー・確認だけに限定し、通常のTODOでは本体を操作できるようにする。文字列はtextContentまたは固定内容の安全な生成を用い、外部入力をHTMLとして解釈しない。
- [ ] **Step 5** テストを成功させ、テスト用メモリ保存と偽の移動先を使うブラウザ確認ページで、5ページ、手動チェック、開閉、完了、閉じる、再開を操作確認する。チェック後も同じcheckboxのDOMとフォーカスが残ることを確認する。確認ページはPWAのキャッシュに追加しない。
- [ ] **Step 6** このタスクのファイルだけを `feat: add initial intro and single floating todo view` としてコミットする。

### Task 4 入力を保護する画面移動

**Files:**

- Create: guide-navigation.js
- Modify: index.htmlの保存、編集画面、設定の接続部分
- Modify: checklist/app.jsの読み取り専用ナビゲーション状態
- Test: tests/guide-navigation.test.cjs、tests/guide-save-safety.test.cjs

**Interfaces:**

- Consumes: GuideTarget、PendingEditor、GuideHost
- Produces: `MitoriGuideNavigation.createGuideNavigator(host:GuideHost): {navigate(target:GuideTarget): Promise<boolean>}`
- Produces in index.html: `createMitoriGuideHost(view:GuideView): GuideHost`
- Produces in index.html: `captureGuideEditorBaseline(id:string): void`、`inspectGuideEditors(target:GuideTarget): Promise<PendingEditor[]>`
- Produces in index.html: `runGuideSafeSave(editorId:string, action:()=>boolean): boolean`
- Updates: `saveSharedClassEdit(notify=true): boolean`、`saveClassEdit(): boolean`、`saveTermSettings(notify=true): boolean`
- Produces on checklist API: `getGuideNavigationState(): {kind:'safe'|'manual',label:string}`。保存や画面変更はしない。

- [ ] **Step 1 テストを書く。** `saved selections navigate without a prompt`、`save then navigate happens in that order`、`cancel validation failure and write failure never navigate`、`manual editor never invokes record finalize apply or restore`、`simultaneous pending editors require manual resolution`、`rapid duplicate requests run only one save` を確認する。

```js
const calls = [];
const host = {
  inspectEditors: () => [{id:'shared-class',label:'クラスと名簿',kind:'saveable'}],
  confirmSave: async () => { calls.push('confirm'); return true; },
  saveEditor: () => { calls.push('save'); return false; },
  openTarget: async () => { calls.push('open'); return true; },
  notify: () => {},
};
const nav = Navigation.createGuideNavigator(host);
assert.equal(await nav.navigate({kind:'board'}), false);
assert.deepEqual(calls, ['confirm','save']);
```

保存安全性テストは、既存テスト同様にindex.htmlの関数をvmで読み込み、保存の例外、必須値不足、既存の確認キャンセルを与える。`failed new-class save leaves no generated class behind`、`failed tile save restores layout derived data and editing ids`、`invalid term dates leave saved and in-memory ranges intact` を確認する。`render failure does not roll back a successful write` では保存と描画の失敗を区別する。正常な保存の結果は従来と一致し、保存失敗時にダイアログの入力と表示が残ることも確認する。

- [ ] **Step 2** 上記2テストが新規接続未作成により失敗することを確認する。
- [ ] **Step 3** navigateの排他制御を実装する。inspectEditorsとsaveEditorの結果はawaitしてから判断する。編集が0件なら移動、saveableが1件なら確認後に保存、manualまたは複数件なら元画面での操作を案内して移動しない。finallyで排他状態を解除する。同じ開いたクラスの名簿欄へスクロールするだけなら未保存入力を保存せず、そのまま移動できる経路にする。
- [ ] **Step 4** 既存の3保存関数に成功・失敗の戻り値と保存失敗時の保護を追加する。runGuideSafeSaveのactionは検証・データ変更・保存だけとし、保存前のstateと編集識別子を保持して、検証失敗・確認キャンセル・保存例外では戻す。画面を閉じる処理と描画は保存成功判定の外側で行い、描画失敗を理由に保存済みデータを巻き戻さない。戻す際に本体を再描画して入力を失わない。日付の候補は有効性を確認してから保存する。保存例外時には通常の保存操作にも分かる案内を出すが、正常時の操作手順を変えない。
- [ ] **Step 5** フォームへ値を入れた直後だけ初期値をメモリ内に保持し、現在の入力と比較する。対象はクラス・名簿、授業タイル、学期の日付、未実行の反映開始日、未追加の学年・教科名とする。再描画が入力値を維持する場合は初期値を取り直さない。コピーした名簿を含む初期値はlocalStorageへ書かない。
- [ ] **Step 6** 追加の編集保護を接続する。見取り内容・授業内容リストの未保存編集、recordModalのタグとメモ、performanceDraft、performanceResultDraft、未確定のカメラ画面は、自動確定せず手動操作へ案内する。チェック表は編集開始時のフォーム・パレット・列の初期値と比較し、未保存変更があればgetGuideNavigationStateでmanualを返す。自動保存の待ち行列は既存のchecklistApi.flushで完了を待ち、成功なら不要な確認を出さず、失敗なら元画面にとどまる。`queued checklist save is awaited without committing a draft` と `failed checklist flush blocks navigation` をテストする。保存済みの週案メモに不要な確認を出さない。
- [ ] **Step 7** 本体の接続を実装する。確認はview.confirmへ接続し、名簿の場合は登録内容が更新されることも説明する。設定はshow('settingsView')とshowSettingsPaneを使い、rosterTextとtimetableApplyStartInputへ必要なスクロールを行う。名簿は開いたクラスを優先し、0件なら新規画面、1件ならそのクラス、複数ならview.chooseClassで選択を求める。選択を取り消したら移動しない。ホームへの案内は保存保護後にsetMode('record')を使う。読み取り専用のレポート詳細等は、入力保護の後で既存の閉じる処理を使う。
- [ ] **Step 8** 全テストを実行し、既存52件も成功することを確認する。index.htmlの変更が保存保護とガイド接続に限定されていることを確認する。
- [ ] **Step 9** このタスクの変更だけを `feat: protect unsaved input during guide navigation` としてコミットする。

### Task 5 直前のチェック表示とパネルの移動

**Files:**

- Modify: guide-model.js、guide-view.js、guide.css
- Test: tests/guide-position.test.cjs、tests/guide-ui-contract.test.cjs

**Interfaces:**

- Consumes: TodoSession、GuideSnapshot.position
- Produces: `clampGuidePosition(position:{x,y}, size:{width,height}, viewport:{left,top,width,height}, margin=12): {x,y}`
- Produces: `resolveTodoScroll({scrollTop,viewportHeight,lastRow,nextSummary}): {scrollTop,showRecent}`。行のtopとbottomは一覧内の座標とする。
- View emits: `GuideAction {type:'position', position:{x,y}}` を移動終了、キーボード移動、画面補正時に送る。

- [ ] **Step 1 テストを書く。** `previous checked row and next summary stay visible when they fit` と `distant next item uses recent completion instead of hiding the last action` で次を確認する。

```js
assert.deepEqual(Model.resolveTodoScroll({
  scrollTop:0, viewportHeight:300,
  lastRow:{top:100,bottom:150}, nextSummary:{top:170,bottom:210},
}), {scrollTop:100,showRecent:false});
const wrapped = Model.resolveTodoScroll({
  scrollTop:900, viewportHeight:300,
  lastRow:{top:950,bottom:1000}, nextSummary:{top:0,bottom:80},
});
assert.equal(wrapped.showRecent, true);
assert.equal(wrapped.scrollTop, 0);
```

位置は12ピクセルの余白、幅400、高さ560、狭い画面、visualViewportのoffset、古い大きな座標を検証する。移動中に画面を縮めた場合も、補正後のx/yが有限で、閉じる操作が見えることを確認する。

- [ ] **Step 2** `node --test tests/guide-position.test.cjs` の失敗を確認する。
- [ ] **Step 3** 位置とスクロール計算を実装する。直前の折り畳まれた行と次の見出しが収まれば、直前の行の上端へスクロールする。収まらなければ直前の完了を固定部分へ示し、次の見出しを表示する。チェック解除時は補助表示を消す。本体にscrollIntoViewを適用しない。
- [ ] **Step 4** パネルは初期位置で本体ヘッダーを避ける。タイトル付近に専用の移動ハンドルを置き、5ピクセル未満の動きは移動にしない。ハンドルにだけtouch-action:noneを指定する。pointer capture、pointerup、pointercancel、lostpointercaptureで移動状態を確実に終了する。矢印キーは16ピクセルずつの移動とする。
- [ ] **Step 5** visualViewportのresize/scrollとウィンドウresizeで高さと位置を補正する。幅は400と画面幅から24を引いた値の小さい方、高さは560と利用可能高さの80%を基本とし、小さい画面では固定部分を確保して見える範囲へ収める。文字を省略せず折り返す。操作対象は原則44ピクセルの押せる範囲を確保する。
- [ ] **Step 6** TODOはz-index:115、案内・メニューは160、ガイドの確認は180とする。既存の一般設定モーダル99より上、日付選択120とPWA更新200より下にする。既存の削除・授業時数取消・出力時の重要な確認にはguideCriticalModalを付け、170以上で表示する。全印刷モードではmitoriGuideRootを非表示にする。
- [ ] **Step 7** テストを成功させ、ブラウザ確認ページでマウス移動、チェック中のフォーカス、手動開閉、先頭へ戻るチェック、縮小、キーボード移動を確認する。移動ハンドル以外の操作でパネル位置が変わらないことを確認する。
- [ ] **Step 8** 変更を `feat: keep guide context visible and support panel dragging` としてコミットする。

### Task 6 ヘッダーの入口と任意の初回案内

**Files:**

- Modify: index.htmlのヘッダー、共通領域、起動処理
- Modify: checklist/app.jsの初期読込み通知
- Modify: guide-app.js
- Test: tests/guide-bootstrap.test.cjs、tests/guide-ui-contract.test.cjs

**Interfaces:**

- Consumes: controller.dispatch、controller.restore、view.showNotice、createMitoriGuideHost、inspectStartupData
- Produces: `bootstrapMitoriGuide({startupStatus,checklistStartupStatus}): void`
- Produces: `shouldShowInitialNotice({startupStatus,checklistStartupStatus,noticeShown}): boolean`
- Adds optional checklist init option: `onInitialStorageRead(status:'fresh'|'existing'|'unknown'): void`
- Produces DOM: `guideHelpBtn`、`mitoriGuideRoot`。各モードのviewの外に配置する。

- [ ] **Step 1 テストを書く。** `new browser shows a nonblocking notice once`、`existing app data skips notice`、`existing checklist without primary storage skips notice`、`unknown checklist startup skips notice` を検証する。

```js
assert.equal(App.shouldShowInitialNotice({
  startupStatus:'fresh', checklistStartupStatus:'fresh', noticeShown:false,
}), true);
assert.equal(App.shouldShowInitialNotice({
  startupStatus:'fresh', checklistStartupStatus:'existing', noticeShown:false,
}), false);
assert.equal(App.shouldShowInitialNotice({
  startupStatus:'fresh', checklistStartupStatus:'unknown', noticeShown:false,
}), false);
```

契約テストは「？」が各モード内ではなくヘッダーにあること、rootがshow/renderの切替対象に含まれないこと、初回案内の判定がstate初期化・バックアップメタ作成より前の情報を使うことを確認する。

- [ ] **Step 2** `node --test tests/guide-bootstrap.test.cjs tests/guide-ui-contract.test.cjs` の失敗を確認する。
- [ ] **Step 3** 起動時に本体側キーの有無を先に読み取る。チェック表はstorage.load直後かつデフォルトworkspace作成前に、読み込めた保存がnullならfresh、保存があればexistingと、追加した任意コールバックへ通知する。個人データは渡さない。初期化に失敗したらunknownとし、無理に初回カードを出さない。このコールバックの有無でチェック表の従来の動作を変えない。
- [ ] **Step 4** guideHelpBtnと共通root、相対パスのCSSと6モジュールの読み込みを追加する。既存のチェック表等の初期化後にコントローラーを接続する。表示中だったパネルを復元し、初回条件を満たす場合だけ任意カードを表示して既読を保存する。「今はしない」でも「？」から開けるようにする。
- [ ] **Step 5** 「？」を開く操作だけではsetMode、renderSettings、renderを呼ばない。「初回設定を進める」と「概要をもう一度見る」を必要な状態で表示し、他の目的別ガイドはまだ表示しない。パネルを閉じても本体側の編集は閉じない。
- [ ] **Step 6** 全テストと、実アプリの新しいローカル保存領域での初回起動・2回目起動・途中再開を確認する。
- [ ] **Step 7** 変更を `feat: connect optional initial guide to MITORI header` としてコミットする。

### Task 7 バージョンとPWAの整合性

**Files:**

- Modify: index.html、sw.js
- Modify: tests/report-ui-contract.test.cjsの表示バージョン確認1件
- Test: tests/guide-pwa-contract.test.cjs

**Interfaces:**

- Consumes: 全ガイドモジュール、guide.css、チェック表接続
- Produces: APP_VERSION、title、footerVersionの一致したローカル実装版v0.4.1
- Produces: APP_SHELLのguideファイルと新しいchecklist/app.jsリクエスト

- [ ] **Step 1 テストを書く。** 6モジュールとCSSのindex.htmlリクエストがAPP_SHELLにも同じパスとqueryであること、checklist/app.js?v=0401が双方にあること、CACHE_NAMEがmitori-app-v13であることを確認する。既存レポートのリリース表示テストだけをv0.4.1へ更新し、本文、記録時氏名、出力についてのテストは変更しない。
- [ ] **Step 2** `node --test tests/guide-pwa-contract.test.cjs tests/report-ui-contract.test.cjs` の失敗を確認する。
- [ ] **Step 3** title、APP_VERSION、フッターをv0.4.1へ揃える。guide-content、guide-model、guide-storage、guide-navigation、guide-app、guide-viewの6つのJSとCSSに?v=0401を付け、同じリクエストをAPP_SHELLに追加する。checklist/app.jsのqueryも更新する。CACHE_NAMEをmitori-app-v13へ変更し、利用者のlocalStorageやIndexedDBは削除しない。
- [ ] **Step 4** 全テストを実行し、オフライン再起動でもガイドと本体が読み込めることをブラウザで確認する。PWA更新バナーとTODOが操作できること、更新後もチェックが残ることを確認する。
- [ ] **Step 5** 変更を `chore: align guide assets and MITORI v0.4.1 cache` としてコミットする。

### Task 8 全体の操作確認と引き渡し

**Files:**

- Create: docs/superpowers/verification/2026-10-14-initial-guide.md
- Modify: 検証で発見した問題の該当ファイルと、その問題を再現するテストのみ

**Interfaces:**

- Consumes: 完成したガイド、承認済み仕様の11節、既存レポートとバックアップ
- Produces: 実施した検証、結果、未実施の端末確認を区別した記録とローカルプレビュー

- [ ] **Step 1** `node --test` を実行し、全テストの件数と失敗0件を記録する。追加テストが単に実装文字列の存在だけを確認していないか、保存・状態変更・移動の結果を確認しているか見直す。
- [ ] **Step 2** 原本と別のローカル保存領域で、架空の2名の名簿を使い、学年・教科、クラスと名簿、国語と算数のタイル、時間割、学期・休業日、反映開始日、授業ボード確認まで実施する。クラスと名簿を同じ画面で保存できること、祝日等を避けた対象日に反映されること、既存の授業ボードを上書きしないことを確認する。
- [ ] **Step 3** 順番どおり・途中から・最後の項目からのチェック、説明の手動開閉、チェック解除、閉じる、再読み込み、ブラウザ再開、リセット、バックアップの「後で」を確認する。ガイド切替はテスト用の2番目のガイドで確認し、製品には追加しない。
- [ ] **Step 4** 未保存のクラス名と名簿、必須項目不足、不正な学期日付、未追加名称、未実行開始日、編集中の見取り記録・テスト・チェック表から移動を試す。保存しない選択、保存失敗、確認キャンセルで移動しないことと、入力が残ることを確認する。保存失敗のテストでは実際の利用データを削除しない。
- [ ] **Step 5** ガイドを表示したまま記録、テスト、チェック表、レポート、週案、設定を往復する。改善済みレポートの期間切替、児童詳細、選択、個票・一覧、Excel・コピーを確認し、出力や印刷にTODOが混ざらないことを確認する。ガイドだけの操作の前後で本体とチェック表のデータを比較し、変更されていないことを確認する。
- [ ] **Step 6** 1366×768、1024×768、768×1024、小さい画面、ブラウザ拡大でパネルの大きさと操作を確認する。マウス、キーボード、可能な環境ではタッチとペンも確認する。実機iPadのソフトウェアキーボードを検証できない場合は、画面サイズ変更だけで実機検証済みとは記載しない。
- [ ] **Step 7** 全体バックアップの保存と復元を架空のデータで試し、ガイド情報が含まれず、復元で手動チェックが変わらないことを確認する。コンソール、ネットワーク、PWA起動に追加のエラーや外部送信がないことを確認する。
- [ ] **Step 8** 実装と仕様の対応を改めてレビューする。名簿更新、保存失敗、再描画、初回カードの既存ユーザーへの非表示、重要な確認の重なりを優先する。問題があれば再現テストを先に追加し、修正後に全テストを再実行する。
- [ ] **Step 9** 検証記録と必要な修正をコミットし、ローカルプレビューと結果をユーザーへ提示する。公開は別途指示を受けてから行う。

## 仕様とタスクの対応

| 仕様の内容 | 対応するタスク |
| --- | --- |
| 5ページと9項目の文言、ボタン名、操作順序 | Task 1、Task 3 |
| 手動チェック、任意順、解除、説明の手動開閉 | Task 1、Task 3 |
| 直前のチェックと次の説明の見やすさ | Task 5 |
| 移動先、対象クラスの選択、未保存入力の保護 | Task 4 |
| 本体と独立した保存、閉じる、再開、リセット | Task 2、Task 3 |
| 表示維持、ドラッグ、画面内への補正、印刷からの除外 | Task 3、Task 5、Task 6 |
| 新規利用者だけへの任意カード、常設の「？」 | Task 6 |
| 既存機能と保存形式の維持、PWAの更新 | Task 4、Task 6、Task 7 |
| 初回操作、途中再開、レポート、バックアップの検証 | Task 8 |

## 実行方法の確認

この計画は複数の接続箇所で保存成功と未保存入力の扱いをそろえる必要があるため、同じ担当がこのチャット内で順に実装・検証する方法を推奨する。別の実行方法を選ぶ場合も、承認済み仕様と本計画を共通の基準とする。

本体の実装は、この計画の内容と実行方法について確認を受けた後に開始する。
