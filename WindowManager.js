
export class WindowManager {
    constructor() {
        this.windows = [];
        this.count = 0;
        this.id = 0;
        this.winData = [];
        this.winShapeChangeCallback = null;
        this.winChangeCallback = null;
    }

    init(metaData) {
        this.windows = JSON.parse(localStorage.getItem("windows")) || [];
        this.count = localStorage.getItem("count") || 0;
        this.count++;

        this.id = this.count;
        let shape = { x: window.screenX, y: window.screenY, w: window.innerWidth, h: window.innerHeight };
        this.winData = { id: this.id, shape: shape, metaData: metaData };
        this.windows.push(this.winData);

        localStorage.setItem("count", this.count);
        localStorage.setItem("windows", JSON.stringify(this.windows));

        window.addEventListener('storage', (event) => {
            if (event.key == "windows") {
                let newWindows = JSON.parse(event.newValue);
                let winChange = (this.windows.length != newWindows.length);
                this.windows = newWindows;

                if (winChange) {
                    if (this.winChangeCallback) this.winChangeCallback();
                }
            }
        });

        window.addEventListener('beforeunload', () => {
            let index = this.getWinIndex(this.id);
            if (index != -1) {
                this.windows.splice(index, 1);
                localStorage.setItem("windows", JSON.stringify(this.windows));
            }
        });
    }

    update() {
        let shape = { x: window.screenX, y: window.screenY, w: window.innerWidth, h: window.innerHeight };
        let winShapeChanged = (shape.x != this.winData.shape.x || shape.y != this.winData.shape.y || shape.w != this.winData.shape.w || shape.h != this.winData.shape.h);

        if (winShapeChanged) {
            this.winData.shape = shape;
            let index = this.getWinIndex(this.id);
            if (index != -1) {
                this.windows[index].shape = shape;
                localStorage.setItem("windows", JSON.stringify(this.windows));
                if (this.winShapeChangeCallback) this.winShapeChangeCallback();
            }
        }
    }

    setWinShapeChangeCallback(callback) {
        this.winShapeChangeCallback = callback;
    }

    setWinChangeCallback(callback) {
        this.winChangeCallback = callback;
    }

    getWindows() {
        return this.windows;
    }

    getWinIndex(id) {
        let index = -1;
        for (let i = 0; i < this.windows.length; i++) {
            if (this.windows[i].id == id) index = i;
        }
        return index;
    }

    getThisWindowData() {
        return this.winData;
    }

    getid() {
        return this.id;
    }
}
