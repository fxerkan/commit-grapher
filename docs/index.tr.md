# commit-grapher — Hesaplarınızı bağlama

Bir sürüm kontrol hesabı eklemek için platform bazında rehberler. commit-grapher **yalnızca meta verileri** (commit'ler, branch'ler, PR'lar) okur — kodunuzu asla klonlamaz ve token'lar işletim sisteminizin anahtarlığında (keychain) kalır.

| Platform | Durum | Rehber |
|---|---|---|
| GitHub | ✅ Hazır | [github.tr.md](github.tr.md) |
| Azure DevOps | ✅ Hazır | [azure-devops.tr.md](azure-devops.tr.md) |
| Jira | ✅ Hazır | [jira.tr.md](jira.tr.md) — issue'lar commit'lerinize/PR'larınıza/branch'lerinize eşleştirilir |
| Bitbucket | ✅ Hazır | [bitbucket.tr.md](bitbucket.tr.md) — API token (app password'ler kullanımdan kaldırıldı) |
| GitLab | ✅ Hazır | [gitlab.tr.md](gitlab.tr.md) — `read_api` token, kullanıcı veya grup |
| Gitea | ✅ Hazır | [gitea.tr.md](gitea.tr.md) — `read:repository` token; self-hosted için `owner_url` ayarlayın |
| Codeberg | ✅ Hazır | [codeberg.tr.md](codeberg.tr.md) — barındırılan Gitea, aynı token akışı |

## Hızlı başlangıç
1. Uygulamayı açın (`uvicorn app.main:app --app-dir backend`, ardından http://localhost:8000).
2. İlk çalıştırma **onboarding sihirbazını** gösterir — bir sağlayıcı seçin, adımlarını izleyin, token'ı yapıştırın, **Sync**.
3. **＋ Add account** ile **birden fazla hesap** (hatta birden fazla GitHub kullanıcısı / organizasyonu) ekleyebilirsiniz.

## Çoğu kişinin karşılaştığı iki tuzak
- **GitHub organizasyonları**: fine-grained token'lar, organizasyon onaylayana kadar bir organizasyonun repolarını göremez. `repo` + `read:org` kapsamlı bir **classic** token kullanın. Bkz. [github.tr.md](github.tr.md).
- **Azure Stakeholder lisansı**: Code okuyamaz — **Basic** seviyesine yükseltin (5 kullanıcı için ücretsiz). Bkz. [azure-devops.tr.md](azure-devops.tr.md).
