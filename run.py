"""Entry-point script to run Mini Smart City Simulator."""
import sys
from pathlib import Path

current_dir = Path(__file__).resolve().parent
if str(current_dir) not in sys.path:
    sys.path.insert(0, str(current_dir))

app_dir = current_dir / "appminiproject"
if app_dir.exists() and str(app_dir) not in sys.path:
    sys.path.insert(0, str(app_dir))

from smart_city_simulator.main import main

if __name__ == "__main__":
    main()
