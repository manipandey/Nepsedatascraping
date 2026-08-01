#!/usr/bin/env python3
import os
import sys
import time
import webbrowser
import http.server
import socketserver
import threading
from scrape import scrape_nepse

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

import json

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        if self.path == "/api/scrape" or self.path.startswith("/api/scrape?"):
            print("\n[Server] Live re-scrape requested from dashboard client...")
            success = scrape_nepse()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.end_headers()
            response_data = {"success": success}
            self.wfile.write(json.dumps(response_data).encode("utf-8"))
            print("[Server] Re-scrape execution completed, sent response to client.\n")
        else:
            super().do_GET()

def start_server():
    # Use socketserver.TCPServer to bind to port 8000
    # Allow address reuse to prevent "Address already in use" errors
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"\n[Server] Dashboard server started at http://localhost:{PORT}/")
        print("[Server] Press Ctrl+C in this terminal to stop the server.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[Server] Stopping server...")

def main():
    print("=" * 60)
    print("            NEPSE DATA SCRAPER & TERMINAL DASHBOARD            ")
    print("=" * 60)
    
    # 1. Scrape latest NEPSE data
    print("\n[1/3] Fetching latest NEPSE share prices...")
    success = scrape_nepse()
    if not success:
        print("\n[Warning] Scraping failed or completed with errors.")
        print("Starting server anyway to display cached data if available...\n")
    else:
        print("\n[2/3] Scraping completed successfully! Data saved to data/ directory.")
        
    # 2. Start HTTP server in a separate thread
    print("\n[3/3] Launching web server...")
    server_thread = threading.Thread(target=start_server)
    server_thread.daemon = True
    server_thread.start()
    
    # Give the server a moment to start
    time.sleep(1.0)
    
    # 3. Open browser
    dashboard_url = f"http://localhost:{PORT}/index.html"
    print(f"\n[Browser] Opening dashboard in browser: {dashboard_url}")
    webbrowser.open(dashboard_url)
    
    # Keep main thread alive to allow Ctrl+C to terminate
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nExiting. Thank you for using NEPSE Scraper!")

if __name__ == "__main__":
    main()
