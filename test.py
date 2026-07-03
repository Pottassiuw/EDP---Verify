import urllib.request, json; req = urllib.request.Request('http://localhost:8000/api/input/bases/sync-sap', data=b'{}', method='POST'); req.add_header('Content-Type', 'application/json'); req.add_header('X-User', 'E713105'); try: urllib.request.urlopen(req)
except Exception as e: print(e.read().decode('utf-8'))
