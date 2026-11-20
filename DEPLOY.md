# Deploy prompt for OpenClaw: Lander on Helppox

Game: Myrsky Lander, repository https://github.com/apn201/Myrsky-Lander
Address: https://lander.helppox.com (CNAME to Helppox)
Directory on Helppox: `/var/www/lander`

Copy everything between the two lines into a fresh OpenClaw chat. Nothing needs filling in.

---

Deploy a static browser game to my Rocky Linux server Helppox (Apache httpd). This is a NEW, SEPARATE site. Other sites run on this server and must not be disturbed in any way.

Values:
- Domain: `lander.helppox.com` (the CNAME already points to Helppox)
- Source: the `web/` folder of the public repository `https://github.com/apn201/Myrsky-Lander.git`, branch `main`
- Directory: `/var/www/lander`

Hard rules:
- You may create or change ONLY these paths: `/tmp/lander-src`, `/var/www/lander`, `/etc/httpd/conf.d/lander.conf`, the certificate files certbot makes for `lander.helppox.com` (and its `lander-le-ssl.conf`), `/usr/local/bin/lander-update`, and the logs `/var/log/httpd/lander_*.log`.
- Do not open, edit, move, rename or delete anything else: no other directory in `/var/www`, no other file in `/etc/httpd/`, no other update script. If a step seems to need any other path, stop and ask me.
- Before every `rsync --delete` or `rm -rf`, print the exact command and check that the target is exactly `/var/www/lander/` or `/tmp/lander-src`. Never run them with a variable or empty path.
- Use `systemctl reload httpd`, never restart or stop.
- Do not install packages, open firewall ports or change SELinux policy without asking me.
- Use `sudo` for every command that writes outside `/tmp`.
- Stop and report if any step fails. Do not improvise a fix that touches other paths.

Steps:
1. Look only, change nothing. Show:
   `cat /etc/rocky-release`, `systemctl is-active httpd`, `ls /etc/httpd/conf.d/`, `which git rsync certbot`, `ls -la /var/www/lander`.
   `/var/www/lander` should not exist. If it exists, show its contents and ask me before continuing.
   Note: an earlier failed attempt may have created an empty `/var/www/myrsky-lander`. Do not touch it; just tell me whether it exists and what is in it.
2. Fetch and copy (plain static files: no build, no PHP, no database, no Node):
   ```bash
   rm -rf /tmp/lander-src
   git clone --depth 1 https://github.com/apn201/Myrsky-Lander.git /tmp/lander-src
   sudo mkdir -p /var/www/lander
   sudo rsync -a --delete /tmp/lander-src/web/ /var/www/lander/
   ```
   `index.html` and `.htaccess` must end up directly in `/var/www/lander/`. Show `ls -la /var/www/lander`.
3. Permissions and SELinux, for this directory only:
   ```bash
   sudo chown -R root:root /var/www/lander
   sudo find /var/www/lander -type d -exec chmod 755 {} +
   sudo find /var/www/lander -type f -exec chmod 644 {} +
   sudo restorecon -Rv /var/www/lander
   ```
4. Create the NEW file `/etc/httpd/conf.d/lander.conf` (if it already exists, stop and ask me):
   ```apache
   <VirtualHost *:80>
     ServerName lander.helppox.com
     DocumentRoot /var/www/lander
     <Directory /var/www/lander>
       Options -Indexes
       AllowOverride FileInfo Indexes Options
       Require all granted
     </Directory>
     ErrorLog /var/log/httpd/lander_error.log
     CustomLog /var/log/httpd/lander_access.log combined
   </VirtualHost>
   ```
   The game's own `.htaccess` sets the MIME types (`.js` text/javascript, `.i16` and `.bin` application/octet-stream, `.wav` audio/wav), compression and cache headers.
5. `sudo apachectl configtest`. Only if it says `Syntax OK`: `sudo systemctl reload httpd`. If it reports an error, remove only `/etc/httpd/conf.d/lander.conf` and stop.
6. HTTPS, for this domain only: `sudo certbot --apache -d lander.helppox.com --redirect`. Never run certbot without `-d lander.helppox.com`, and do not choose any other certificate or vhost if it asks; stop and ask me instead.
7. Check:
   - `curl -sI https://lander.helppox.com/` → 200, `text/html`
   - `curl -s https://lander.helppox.com/ | grep -c "<title>Myrsky Lander"` → 1
   - `curl -sI https://lander.helppox.com/js/game/main.js` → 200, `text/javascript`
   - `curl -sI https://lander.helppox.com/assets/terrain_1024.i16` → 200
   - `curl -sI https://lander.helppox.com/assets/audio/chatter.wav` → 200, `audio/wav`
   - `curl -sI https://lander.helppox.com/assets/` → 403
   - `ls /etc/httpd/conf.d/` → the same list as in step 1, plus only `lander.conf` and `lander-le-ssl.conf`
8. Create `/usr/local/bin/lander-update` (new file; if it exists, ask me):
   ```bash
   #!/bin/bash
   set -euo pipefail
   rm -rf /tmp/lander-src
   git clone --depth 1 https://github.com/apn201/Myrsky-Lander.git /tmp/lander-src
   test -f /tmp/lander-src/web/index.html
   rsync -a --delete /tmp/lander-src/web/ /var/www/lander/
   chown -R root:root /var/www/lander
   find /var/www/lander -type d -exec chmod 755 {} +
   find /var/www/lander -type f -exec chmod 644 {} +
   restorecon -R /var/www/lander
   echo "Lander updated to $(git -C /tmp/lander-src log -1 --format='%h %s')"
   ```
   `sudo chmod 755 /usr/local/bin/lander-update`. Do not schedule it.
9. Report: the URL, whether HTTPS works, the outputs of step 7, and whether `/var/www/myrsky-lander` exists.

The game must be open to everyone without a login.

---
