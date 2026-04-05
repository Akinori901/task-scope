FROM mysql:8.0

# UTF-8 設定
RUN echo '[mysqld]\ncharacter-set-server=utf8mb4\ncollation-server=utf8mb4_unicode_ci\n\n[client]\ndefault-character-set=utf8mb4' > /etc/mysql/conf.d/charset.cnf
