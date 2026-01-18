"""
Simple HTTP Server for Exam Proctoring System
==============================================
Serves the exam application on localhost with proper MIME types
and CORS headers for camera/microphone access.
"""

from http.server import HTTPServer, SimpleHTTPRequestHandler
import os

class CORSRequestHandler(SimpleHTTPRequestHandler):
    """
    Custom handler with CORS support and proper MIME types
    """
    
    def end_headers(self):
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        
        # Security headers for camera/mic access
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        
        SimpleHTTPRequestHandler.end_headers(self)
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()
    
    def log_message(self, format, *args):
        # Custom logging
        print(f"[SERVER] {self.address_string()} - {format % args}")


def run_server(port=8000):
    """
    Start the HTTP server
    """
    server_address = ('', port)
    httpd = HTTPServer(server_address, CORSRequestHandler)
    
    print("=" * 60)
    print("🎓 EXAM PROCTORING SERVER")
    print("=" * 60)
    print(f"\n✅ Server running on:")
    print(f"   Local:    http://localhost:{port}")
    print(f"   Network:  http://{get_local_ip()}:{port}")
    print(f"\n📁 Serving files from: {os.getcwd()}")
    print(f"\n⚠️  IMPORTANT: For camera/mic access, you'll need:")
    print(f"   - HTTPS (use Cloudflare Tunnel)")
    print(f"   - Or localhost (for local testing only)")
    print(f"\n🛑 Press Ctrl+C to stop the server\n")
    print("=" * 60)
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n🛑 Server stopped by user")
        httpd.shutdown()


def get_local_ip():
    """
    Get local IP address
    """
    import socket
    try:
        # Create a socket to find local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except:
        return "127.0.0.1"


if __name__ == "__main__":
    # You can change the port here if 8000 is already in use
    PORT = 8000
    run_server(PORT)
