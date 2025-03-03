// DOM 元素
const video = document.getElementById('input-video');
const canvas = document.getElementById('output-canvas');
const statusBar = document.getElementById('status-bar');
const ctx = canvas.getContext('2d');

// 设置画布尺寸
function setupCanvas() {
    // 使用视口宽度和高度，而不是视频尺寸
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // 确保画布在计算器上层
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.zIndex = '2000'; // 比计算器的z-index更高
}

// 添加窗口大小变化事件监听
window.addEventListener('resize', setupCanvas);

// 更新状态栏显示
function updateStatus(message) {
    statusBar.textContent = message;
}

// 初始化 MediaPipe Hands
let hands;
let camera;
let lastHandsDetected = false;

function initializeHands() {
    hands = new Hands({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
    });
    
    // 配置模型
    hands.setOptions({
        maxNumHands: 2,         // 最多检测两只手
        modelComplexity: 1,     // 模型复杂度 (0-1)
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    
    // 处理结果
    hands.onResults(onResults);
}

// 处理 MediaPipe 手部检测结果
function onResults(results) {
    // 不再使用视频尺寸作为判断依据，而是根据窗口大小
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        setupCanvas();
    }
    
    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 检查是否检测到手
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        // 有手被检测到
        if (!lastHandsDetected) {
            updateStatus("已检测到人手");
            lastHandsDetected = true;
        }
        
        // 对每只检测到的手绘制骨骼
        results.multiHandLandmarks.forEach(landmarks => {
            drawHandSkeleton(landmarks);
            
            // 检测拇指和食指是否捏合
            checkPinchGesture(landmarks);
        });
    } else {
        // 没有手被检测到
        if (lastHandsDetected) {
            updateStatus("没有检测到人手");
            lastHandsDetected = false;
        }
    }
}

// 绘制手部骨骼
function drawHandSkeleton(landmarks) {
    // 手指连接定义 (类似 OpenPose 的风格)
    const connections = [
        // 拇指连接
        [0, 1], [1, 2], [2, 3], [3, 4],
        // 食指连接
        [0, 5], [5, 6], [6, 7], [7, 8],
        // 中指连接
        [9, 10], [10, 11], [11, 12], [5, 9],
        // 无名指连接
        [9, 13], [13, 14], [14, 15], [15, 16],
        // 小指连接
        [13, 17], [17, 18], [18, 19], [19, 20],
        // 手掌连接
        [0, 17], [2, 5],
    ];
    
    // 计算视频在画布上的实际显示尺寸和位置
    const videoRatio = video.videoWidth / video.videoHeight;
    const canvasRatio = canvas.width / canvas.height;
    
    let displayWidth, displayHeight, offsetX, offsetY;
    
    if (videoRatio > canvasRatio) {
        // 视频比画布更宽
        displayHeight = canvas.height;
        displayWidth = displayHeight * videoRatio;
        offsetX = (canvas.width - displayWidth) / 2;
        offsetY = 0;
    } else {
        // 视频比画布更窄或相等
        displayWidth = canvas.width;
        displayHeight = displayWidth / videoRatio;
        offsetX = 0;
        offsetY = (canvas.height - displayHeight) / 2;
    }
    
    // 设置固定的骨骼节点大小 (不随窗口大小变化)
    const nodeRadius = 8;
    const outlineRadius = 10;
    const lineWidth = 5;
    
    // 计算坐标转换函数
    const transformX = (x) => offsetX + x * displayWidth;
    const transformY = (y) => offsetY + y * displayHeight;
    
    // 绘制骨骼连接 - 改为红色
    ctx.strokeStyle = 'rgba(255, 0, 0, 1.0)'; // 使用纯红色，无透明度
    ctx.lineWidth = lineWidth;
    for (const [i, j] of connections) {
        const start = landmarks[i];
        const end = landmarks[j];
        
        if (start && end) {
            ctx.beginPath();
            ctx.moveTo(transformX(start.x), transformY(start.y));
            ctx.lineTo(transformX(end.x), transformY(end.y));
            ctx.stroke();
        }
    }
    
    // 绘制节点 - 使用更大更明显的红色节点
    for (let i = 0; i < landmarks.length; i++) {
        const landmark = landmarks[i];
        const x = transformX(landmark.x);
        const y = transformY(landmark.y);
        
        // 为节点添加白色边框使其在任何背景上都清晰可见
        ctx.beginPath();
        ctx.arc(x, y, outlineRadius, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
        ctx.fill();
        
        // 填充红色节点
        ctx.beginPath();
        ctx.arc(x, y, nodeRadius, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 0, 0, 1.0)'; // 使用纯红色
        ctx.fill();
    }
}

// 检测拇指和食指是否捏合
function checkPinchGesture(landmarks) {
    // 拇指尖和食指尖的索引
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    
    // 计算视频在画布上的实际显示尺寸和位置
    const videoRatio = video.videoWidth / video.videoHeight;
    const canvasRatio = canvas.width / canvas.height;
    
    let displayWidth, displayHeight, offsetX, offsetY;
    
    if (videoRatio > canvasRatio) {
        // 视频比画布更宽
        displayHeight = canvas.height;
        displayWidth = displayHeight * videoRatio;
        offsetX = (canvas.width - displayWidth) / 2;
        offsetY = 0;
    } else {
        // 视频比画布更窄或相等
        displayWidth = canvas.width;
        displayHeight = displayWidth / videoRatio;
        offsetX = 0;
        offsetY = (canvas.height - displayHeight) / 2;
    }
    
    // 计算坐标转换函数
    const transformX = (x) => offsetX + x * displayWidth;
    const transformY = (y) => offsetY + y * displayHeight;
    
    // 转换坐标
    const thumbX = transformX(thumbTip.x);
    const thumbY = transformY(thumbTip.y);
    const indexX = transformX(indexTip.x);
    const indexY = transformY(indexTip.y);
    
    // 计算两点之间的距离
    const distance = Math.sqrt(
        Math.pow(thumbX - indexX, 2) + 
        Math.pow(thumbY - indexY, 2)
    );
    
    // 捏合阈值 - 可以根据需要调整
    const pinchThreshold = 50; // 从40像素调整为50像素
    
    // 如果距离小于阈值，则认为是捏合手势
    if (distance < pinchThreshold) {
        // 在拇指和食指之间绘制一个半透明蓝色圆点
        const midX = (thumbX + indexX) / 2;
        const midY = (thumbY + indexY) / 2;
        
        // 绘制蓝色圆点
        ctx.beginPath();
        ctx.arc(midX, midY, 15, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(0, 100, 255, 0.6)'; // 半透明蓝色
        ctx.fill();
    }
}

// 初始化摄像头
async function setupCamera() {
    updateStatus("正在启动摄像头...");
    
    // 请求摄像头权限
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1920 }, // 尝试获取高分辨率
                height: { ideal: 1080 },
                facingMode: 'user' // 使用前置摄像头
            }
        });
        
        video.srcObject = stream;
        
        // 等待视频元数据加载
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                // 设置初始画布尺寸
                setupCanvas();
                resolve(video);
            };
        });
    } catch (error) {
        console.error("无法访问摄像头:", error);
        updateStatus("无法访问摄像头，请确保允许权限");
        throw error;
    }
}

// 创建计算器
function createCalculator() {
    // 创建计算器容器
    const calculator = document.createElement('div');
    calculator.id = 'calculator';
    calculator.style.position = 'fixed';
    calculator.style.top = '20px';
    calculator.style.right = '20px';
    calculator.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    calculator.style.borderRadius = '15px'; // 增加圆角
    calculator.style.padding = '25px'; // 增加内边距
    calculator.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
    calculator.style.zIndex = '1000'; // 这个值小于画布的z-index
    calculator.style.width = '500px'; // 从250px修改为500px，增加到两倍大
    
    // 创建显示屏
    const display = document.createElement('div');
    display.id = 'calc-display';
    display.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    display.style.color = '#000';
    display.style.padding = '20px'; // 增加内边距
    display.style.marginBottom = '20px'; // 增加底部间距
    display.style.borderRadius = '10px'; // 增加圆角
    display.style.textAlign = 'right';
    display.style.fontSize = '36px'; // 增加字体大小
    display.style.fontFamily = 'monospace';
    display.style.overflow = 'hidden';
    display.style.height = '60px'; // 增加高度
    display.textContent = '0';
    calculator.appendChild(display);
    
    // 按钮布局
    const buttons = [
        'C', '←', '%', '/',
        '7', '8', '9', '*',
        '4', '5', '6', '-',
        '1', '2', '3', '+',
        '0', '.', '±', '='
    ];
    
    // 创建按钮容器
    const buttonGrid = document.createElement('div');
    buttonGrid.style.display = 'grid';
    buttonGrid.style.gridTemplateColumns = 'repeat(4, 1fr)';
    buttonGrid.style.gap = '15px'; // 增加按钮间距
    
    // 创建按钮
    buttons.forEach(btn => {
        const button = document.createElement('button');
        button.textContent = btn;
        button.className = 'calc-button';
        button.dataset.value = btn;
        button.style.padding = '20px'; // 增加按钮内边距
        button.style.fontSize = '28px'; // 增加按钮字体大小
        button.style.borderRadius = '10px'; // 增加按钮圆角
        button.style.border = 'none';
        button.style.cursor = 'pointer';
        
        if(['C', '←', '%', '/', '*', '-', '+', '='].includes(btn)) {
            button.style.backgroundColor = '#ff9500';
            button.style.color = 'white';
        } else {
            button.style.backgroundColor = '#e0e0e0';
            button.style.color = '#333';
        }
        
        button.style.transition = 'background-color 0.2s';
        
        // 鼠标悬停效果
        button.addEventListener('mouseover', () => {
            button.style.opacity = '0.8';
        });
        
        button.addEventListener('mouseout', () => {
            button.style.opacity = '1';
        });
        
        buttonGrid.appendChild(button);
    });
    
    calculator.appendChild(buttonGrid);
    document.body.appendChild(calculator);
    
    // 计算器变量
    let currentInput = '0';
    let previousInput = '0';
    let operation = null;
    let resetInput = true;
    
    // 更新显示
    function updateDisplay() {
        display.textContent = currentInput;
    }
    
    // 添加按钮事件监听器
    buttonGrid.addEventListener('click', (e) => {
        if(e.target.classList.contains('calc-button')) {
            const value = e.target.dataset.value;
            
            // 数字输入
            if('0123456789'.includes(value)) {
                if(resetInput || currentInput === '0') {
                    currentInput = value;
                    resetInput = false;
                } else {
                    currentInput += value;
                }
                updateDisplay();
            }
            
            // 小数点
            else if(value === '.' && !currentInput.includes('.')) {
                currentInput += '.';
                resetInput = false;
                updateDisplay();
            }
            
            // 清除
            else if(value === 'C') {
                currentInput = '0';
                previousInput = '0';
                operation = null;
                resetInput = true;
                updateDisplay();
            }
            
            // 退格
            else if(value === '←') {
                if(currentInput.length > 1) {
                    currentInput = currentInput.slice(0, -1);
                } else {
                    currentInput = '0';
                    resetInput = true;
                }
                updateDisplay();
            }
            
            // 正负号切换
            else if(value === '±') {
                currentInput = (parseFloat(currentInput) * -1).toString();
                updateDisplay();
            }
            
            // 百分比
            else if(value === '%') {
                currentInput = (parseFloat(currentInput) / 100).toString();
                updateDisplay();
            }
            
            // 运算符
            else if(['+', '-', '*', '/'].includes(value)) {
                previousInput = currentInput;
                operation = value;
                resetInput = true;
            }
            
            // 等号
            else if(value === '=') {
                let result;
                const prev = parseFloat(previousInput);
                const current = parseFloat(currentInput);
                
                switch(operation) {
                    case '+':
                        result = prev + current;
                        break;
                    case '-':
                        result = prev - current;
                        break;
                    case '*':
                        result = prev * current;
                        break;
                    case '/':
                        result = prev / current;
                        break;
                    default:
                        result = current;
                }
                
                currentInput = result.toString();
                operation = null;
                resetInput = true;
                updateDisplay();
            }
        }
    });
}

// 启动应用
async function startApp() {
    try {
        await setupCamera();
        initializeHands();
        
        updateStatus("初始化中...");
        
        // 创建摄像头实例
        camera = new Camera(video, {
            onFrame: async () => {
                await hands.send({image: video});
            },
            width: 640,
            height: 480
        });
        
        await camera.start();
        updateStatus("没有检测到人手");
        
        // 创建计算器
        createCalculator();
    } catch (error) {
        console.error("应用启动失败:", error);
        updateStatus("应用启动失败，请刷新页面重试");
    }
}

// 启动应用
window.addEventListener('load', startApp); 