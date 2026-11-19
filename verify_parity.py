import hashlib

def get_hash(fn):
    with open(fn, 'rb') as f:
        return hashlib.md5(f.read()).hexdigest()

h_app_full = get_hash('app_full.js')
h_app = get_hash('app.js')
h_html_full = get_hash('triaje_full.html')
h_html = get_hash('triaje.html')

print(f"app_full.js:     {h_app_full}")
print(f"app.js:          {h_app}")
print(f"Match JS:        {h_app_full == h_app}")
print(f"triaje_full.html:{h_html_full}")
print(f"triaje.html:     {h_html}")
print(f"Match HTML:      {h_html_full == h_html}")
