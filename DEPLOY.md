# Deploy prompt for OpenClaw (Helppox, Rocky Linux + Apache)

Copy everything between the two lines into OpenClaw. First replace `lander.example.com` with the real domain or subdomain (it appears several times; replace all). The domain's DNS A/AAAA record must already point to Helppox. The GitHub repository `apn201/Myrsky-Lander` must exist and be public.

---

Deploy a static website (a browser game) to my Rocky Linux server (Helppox), which runs Apache (httpd).

Values:
- Domain: `lander.example.com`
- Source: the `web/` folder of the public git repository `https://github.com/apn201/Myrsky-Lander.git`, branch `main`
- Document root: `/var/www/myrsky-lander`

Rules:
- Do not change, disable or restart any other site (the Myrsky / Ocean of Storms site on this server must stay as it is). Use `systemctl reload httpd`, never restart.
- Do not install packages, open firewall ports or change SELinux policy without asking me first.
- Stop and report if any step fails.

Steps:
1. Look first, change nothing: show the output of `cat /etc/rocky-release`, `systemctl is-active httpd`, `ls /etc/httpd/conf.d/`, `httpd -M | grep -E "mime|deflate|headers|ssl|rewrite"`, `which git rsync certbot`, and `ls -la /var/www/myrsky-lander` (it should not exist yet; if it exists, ask me before overwriting).
2. Fetch the site (plain static files: no build step, no PHP, no database, no Node):
   ```bash
   rm -rf /tmp/lander && git clone --depth 1 https://github.com/apn201/Myrsky-Lander.git /tmp/lander
   mkdir -p /var/www/myrsky-lander
   rsync -a --delete /tmp/lander/web/ /var/www/myrsky-lander/
   ```
   If rsync is missing, use `cp -a /tmp/lander/web/. /var/www/myrsky-lander/`. `index.html` and `.htaccess` must end up directly in `/var/www/myrsky-lander/`.
3. Permissions and SELinux:
   ```bash
   chown -R root:root /var/www/myrsky-lander
   find /var/www/myrsky-lander -type d -exec chmod 755 {} +
   find /var/www/myrsky-lander -type f -exec chmod 644 {} +
   restorecon -Rv /var/www/myrsky-lander
   ```
4. Create `/etc/httpd/conf.d/myrsky-lander.conf`:
   ```apache
   <VirtualHost *:80>
     ServerName lander.example.com
     DocumentRoot /var/www/myrsky-lander
     <Directory /var/www/myrsky-lander>
       Options -Indexes
       AllowOverride FileInfo Indexes Options
       Require all granted
     </Directory>
     ErrorLog /var/log/httpd/myrsky-lander_error.log
     CustomLog /var/log/httpd/myrsky-lander_access.log combined
   </VirtualHost>
   ```
   The site's own `.htaccess` sets the MIME types (`.js` as text/javascript, which ES modules need; `.i16` and `.bin` as application/octet-stream; `.wav` as audio/wav), compression and cache headers. It needs `mod_mime`, `mod_deflate` and `mod_headers`; these are on by default in Rocky's httpd. If one is missing, tell me.
5. `apachectl configtest`. Only if it says `Syntax OK`: `systemctl reload httpd`.
6. HTTPS: if certbot is installed, run `certbot --apache -d lander.example.com --redirect`. If certbot is not installed, tell me and stop here; do not install it without asking.
7. Firewall: show `firewall-cmd --list-services`. If http or https is missing, ask me before adding it.
8. Check from the server (use https if step 6 worked, else http):
   - `curl -sI https://lander.example.com/` → 200, `text/html`
   - `curl -s https://lander.example.com/ | grep -c "<title>Myrsky Lander"` → 1
   - `curl -sI https://lander.example.com/js/game/main.js` → 200, `text/javascript`
   - `curl -sI https://lander.example.com/assets/terrain_1024.i16` → 200
   - `curl -sI https://lander.example.com/assets/audio/chatter.wav` → 200, `audio/wav`
   - `curl -sI https://lander.example.com/assets/` → 403 (no directory listing)
   - `curl -sI https://<the Myrsky domain>/` → still 200 (the other site is untouched)
9. Create `/usr/local/bin/lander-update` so I can update the game later with one command:
   ```bash
   #!/bin/bash
   set -e
   rm -rf /tmp/lander && git clone --depth 1 https://github.com/apn201/Myrsky-Lander.git /tmp/lander
   rsync -a --delete /tmp/lander/web/ /var/www/myrsky-lander/
   chown -R root:root /var/www/myrsky-lander
   find /var/www/myrsky-lander -type d -exec chmod 755 {} +
   find /var/www/myrsky-lander -type f -exec chmod 644 {} +
   restorecon -R /var/www/myrsky-lander
   echo "Updated to $(git -C /tmp/lander log -1 --format='%h %s')"
   ```
   `chmod 755 /usr/local/bin/lander-update`. Do not schedule it; I will run it by hand.
10. Report back: the final URL, the vhost file path, whether HTTPS works, and the output of the checks in step 8.

The game must be open to everyone without a login. Do not add basic auth, IP restrictions or a robots block.

---

## If GitHub is not reachable from the server

Copy the `web/` folder to the server yourself (for example `scp -r web/ helppox:/tmp/lander-web`) and tell OpenClaw to use `/tmp/lander-web/` instead of `/tmp/lander/web/` in steps 2 and 9.
