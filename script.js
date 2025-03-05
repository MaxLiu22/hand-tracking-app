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
    canvas.style.pointerEvents = 'none'; // 禁用鼠标事件捕获，允许点击穿透到下层元素
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
let isPinching = false; // 全局变量，用于跟踪捏合状态
let pinchStartTime = 0; // 记录捏合开始的时间
let isDragging = false; // 是否处于拖拽模式
let dragElement = null; // 当前被拖拽的元素

// 在全局范围添加地球引用变量
let earthScene, earthCamera, earthControls, earthObj, cloudsObj;

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
    // 使用requestAnimationFrame确保UI更新不会阻塞
    requestAnimationFrame(() => {
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
                updateStatus("Hand Detected");
                lastHandsDetected = true;
            }
            
            // 对每只检测到的手绘制骨骼
            results.multiHandLandmarks.forEach(landmarks => {
                // 无论是否处于拖拽模式，都绘制骨骼
                drawHandSkeleton(landmarks);
                
                // 检测拇指和食指是否捏合
                checkPinchGesture(landmarks);
            });
        } else {
            // 没有手被检测到
            if (lastHandsDetected) {
                updateStatus("No Hand Detected");
                lastHandsDetected = false;
            }
            
            // 如果手部消失但仍处于捏合状态，触发松开
            if (isPinching) {
                console.log('Hand disappeared, ending current gesture');
                if (isDragging) {
                    // 结束任何活跃的拖拽操作
                    const lastPos = window._lastPinchPosition || {x: 0, y: 0};
                    triggerDragEnd(lastPos.x, lastPos.y);
                    isDragging = false;
                    dragElement = null;
                } else {
                    // 结束普通点击
                    const lastPos = window._lastPinchPosition || {x: 0, y: 0};
                    triggerMouseUp(lastPos.x, lastPos.y);
                }
                isPinching = false;
            }
        }
    });
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
    
    // 改回原来的计算坐标转换函数 (不再反转坐标)
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
    
    // 非镜像坐标转换用于显示蓝点
    const displayX = (x) => offsetX + x * displayWidth;
    const displayY = (y) => offsetY + y * displayHeight;
    
    // 镜像坐标转换用于点击
    const clickX = (x) => {
        // 翻转X坐标以修正镜像问题
        const mirroredX = 1.0 - x; // 翻转归一化坐标
        return offsetX + mirroredX * displayWidth;
    };
    
    // 使用非镜像坐标计算显示位置
    const thumbDispX = displayX(thumbTip.x);
    const thumbDispY = displayY(thumbTip.y);
    const indexDispX = displayX(indexTip.x);
    const indexDispY = displayY(indexTip.y);
    
    // 使用镜像坐标计算点击位置
    const thumbClickX = clickX(thumbTip.x);
    const thumbClickY = displayY(thumbTip.y); // Y坐标不需要镜像
    const indexClickX = clickX(indexTip.x);
    const indexClickY = displayY(indexTip.y); // Y坐标不需要镜像
    
    // 计算非镜像坐标下两点之间的距离
    const distance = Math.sqrt(
        Math.pow(thumbDispX - indexDispX, 2) + 
        Math.pow(thumbDispY - indexDispY, 2)
    );
    
    // 捏合阈值 - 可以根据需要调整
    const pinchThreshold = 50;
    
    // 点击位置使用镜像坐标
    const midClickX = (thumbClickX + indexClickX) / 2;
    const midClickY = (thumbClickY + indexClickY) / 2;
    
    // 如果距离小于阈值，则认为是捏合手势
    if (distance < pinchThreshold) {
        // 在拇指和食指之间绘制一个半透明蓝色圆点（使用非镜像坐标）
        const midDispX = (thumbDispX + indexDispX) / 2;
        const midDispY = (thumbDispY + indexDispY) / 2;
        
        // 当前时间
        const currentTime = Date.now();
        
        // 计算进度（0到1之间的值）
        const elapsedTime = currentTime - pinchStartTime;
        const progress = Math.min(elapsedTime / 3000, 1); // 3秒为满进度
        
        // 绘制蓝色捏合点（所有阶段都保持蓝色）
        let pointSize = 15;
        
        // 只有在完全达到阈值后才改变颜色
        if ((isDragging || window._isEarthInteraction) && progress >= 1) {
            // 拖拽模式或地球交互模式 - 使用橙色
            ctx.beginPath();
            ctx.arc(midDispX, midDispY, pointSize, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(255, 100, 0, 0.6)';
            ctx.fill();
        } else {
            // 普通捏合 - 蓝色点
            ctx.beginPath();
            ctx.arc(midDispX, midDispY, pointSize, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(0, 100, 255, 0.6)';
            ctx.fill();
            
            // 如果正在进行捏合且未拖拽，绘制白色进度环
            if (isPinching && !isDragging && !window._isEarthInteraction) {
                // 绘制进度环
                ctx.beginPath();
                ctx.arc(midDispX, midDispY, pointSize + 5, -Math.PI/2, -Math.PI/2 + progress * 2 * Math.PI);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.lineWidth = 3;
                ctx.stroke();
                
                // 如果接近阈值（>90%）但未达到，显示橙红色提示点
                if (progress > 0.9 && progress < 1) {
                    ctx.beginPath();
                    ctx.arc(midDispX, midDispY, 4, 0, 2 * Math.PI);
                    ctx.fillStyle = 'rgba(255, 80, 0, 0.8)';
                    ctx.fill();
                }
            }
        }
        
        // 如果是刚开始捏合
        if (!isPinching) {
            console.log('Pinch gesture detected, triggering mouse down event', {x: midClickX, y: midClickY});
            // 记录捏合开始时间
            pinchStartTime = currentTime;
            // 触发鼠标按下事件在镜像位置
            triggerMouseDown(midClickX, midClickY);
            isPinching = true;
            isDragging = false;  // 重置拖拽状态
        } 
        // 接下来的代码处理已经在捏合状态的情况
        else {
            // 如果在地球上进行交互
            if (window._isEarthInteraction) {
                // 旋转地球
                if (window._earthDragStart) {
                    rotateEarth(window._earthDragStart.x, window._earthDragStart.y, midClickX, midClickY);
                }
                
                // 不需要进入拖拽模式，而是持续旋转地球
                if (currentTime - pinchStartTime > 3000) {
                    // 在长捏合时更新起始位置，确保平滑旋转
                    window._earthDragStart = {x: midClickX, y: midClickY};
                    pinchStartTime = currentTime - 2000;
                }
            }
            // 不是地球交互，检查是否需要进入拖拽模式
            else if (!isDragging && (currentTime - pinchStartTime > 3000)) {
                // 捏合超过3秒，进入拖拽模式
                isDragging = true;
                dragElement = window._lastPinchElement;
                triggerDragStart(midClickX, midClickY);
            }
            // 如果已经在拖拽模式，处理移动
            else if (isDragging) {
                // 处理拖拽移动
                triggerDragMove(midClickX, midClickY);
            }
            
            // 显示倒计时进度圈（只在未进入拖拽模式且非地球交互时显示）
            if (!isDragging && !window._isEarthInteraction) {
                const elapsedTime = currentTime - pinchStartTime;
                const progress = Math.min(elapsedTime / 3000, 1);
                
                if (progress < 1) {
                    ctx.beginPath();
                    ctx.arc(midDispX, midDispY, 20, -Math.PI/2, -Math.PI/2 + progress * 2 * Math.PI);
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                    ctx.lineWidth = 3;
                    ctx.stroke();
                }
            }
        }
    } else {
        // 如果之前是捏合状态，现在松开了
        if (isPinching) {
            if (window._isEarthInteraction) {
                console.log('Earth interaction ended');
                window._isEarthInteraction = false;
                window._earthDragStart = null;
            } else if (isDragging) {
                // 结束拖拽
                console.log('Pinch gesture ended, ending drag operation');
                triggerDragEnd(midClickX, midClickY);
                isDragging = false;
                dragElement = null;
            } else {
                // 普通点击结束
                console.log('Pinch gesture ended, triggering mouse up event');
                triggerMouseUp(midClickX, midClickY);
            }
            isPinching = false;
        }
    }
}

// 检测是否点击在THREE.js的地球容器上
function isClickOnEarthContainer(element) {
    // 向上查找父元素，检查是否是地球容器
    let currentElement = element;
    while (currentElement) {
        if (currentElement.id === 'earth-container' || 
            (currentElement.tagName === 'CANVAS' && currentElement.parentElement && 
             currentElement.parentElement.id === 'earth-container')) {
            return true;
        }
        currentElement = currentElement.parentElement;
    }
    return false;
}

// 修改 triggerMouseDown 函数
function triggerMouseDown(x, y) {
    console.log('Triggering mouse down event:', x, y);
    
    // 创建点击反馈效果
    createClickEffect(x, y, 'rgba(0, 100, 255, 0.3)'); // 使用较浅的蓝色表示按下状态
    
    // 获取点击位置的元素
    const element = document.elementFromPoint(x, y);
    
    // 检查是否点击在地球容器上
    if (element && isClickOnEarthContainer(element)) {
        console.log('Clicked on Earth, will be handled by THREE.js');
        window._isEarthInteraction = true; // 标记为地球交互
        // 仍然保存位置以便在松开时使用
        window._lastPinchPosition = {x, y};
        return; // 不创建鼠标事件，让THREE.js的控制器处理
    }
    
    // 如果找到元素，触发鼠标按下事件
    if (element) {
        console.log('Element found:', element.tagName, element.className);
        
        // 创建鼠标按下事件
        const mouseDownEvent = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: x,
            clientY: y
        });
        
        try {
            element.dispatchEvent(mouseDownEvent);
            console.log(`Triggering mouse down event successfully at (${x}, ${y}) on:`, element);
            
            // 保存当前元素，以便在松开时使用
            window._lastPinchElement = element;
            window._lastPinchPosition = {x, y};
            window._isEarthInteraction = false; // 标记为非地球交互
        } catch (error) {
            console.error('Triggering mouse down event failed:', error);
        }
    } else {
        console.log('Element not found at coordinates:', x, y);
    }
}

// 修改 triggerMouseUp 函数
function triggerMouseUp(x, y) {
    console.log('Triggering mouse up event:', x, y);
    
    // 创建点击完成效果
    createClickEffect(x, y, 'rgba(0, 255, 100, 0.5)'); // 使用绿色表示松开状态
    
    // 如果是地球交互，直接返回
    if (window._isEarthInteraction) {
        window._isEarthInteraction = false;
        return;
    }
    
    // 获取之前按下时的元素和位置
    const element = window._lastPinchElement;
    const lastPosition = window._lastPinchPosition || {x, y};
    
    // 如果找到元素，触发鼠标松开和点击事件
    if (element) {
        console.log('Completed click on:', element.tagName, element.className);
        
        // 创建鼠标松开事件
        const mouseUpEvent = new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: lastPosition.x,
            clientY: lastPosition.y
        });
        
        // 创建点击事件
        const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: lastPosition.x,
            clientY: lastPosition.y
        });
        
        try {
            // 先触发鼠标松开事件
            element.dispatchEvent(mouseUpEvent);
            console.log(`Triggering mouse up event successfully at (${lastPosition.x}, ${lastPosition.y}) on:`, element);
            
            // 然后触发点击事件
            element.dispatchEvent(clickEvent);
            console.log(`Triggering click event successfully at (${lastPosition.x}, ${lastPosition.y}) on:`, element);
            
            // 清除缓存的元素和位置
            window._lastPinchElement = null;
            window._lastPinchPosition = null;
        } catch (error) {
            console.error('Triggering mouse up or click event failed:', error);
        }
    } else {
        console.log('Completed click but no previous element');
    }
}

// 创建点击效果 (添加颜色参数)
function createClickEffect(x, y, color = 'rgba(255, 255, 255, 0.5)') {
    // 创建点击效果容器
    const clickEffect = document.createElement('div');
    clickEffect.style.position = 'fixed';
    clickEffect.style.left = (x - 20) + 'px';
    clickEffect.style.top = (y - 20) + 'px';
    clickEffect.style.width = '40px';
    clickEffect.style.height = '40px';
    clickEffect.style.borderRadius = '50%';
    clickEffect.style.backgroundColor = color;
    clickEffect.style.border = '2px solid rgba(0, 100, 255, 0.8)';
    clickEffect.style.zIndex = '1000'; // 与计算器同层
    clickEffect.style.pointerEvents = 'none'; // 避免干扰点击
    
    // 添加动画效果
    clickEffect.style.animation = 'clickRipple 0.6s ease-out forwards';
    
    // 创建动画样式
    if (!document.getElementById('click-animation-style')) {
        const styleElement = document.createElement('style');
        styleElement.id = 'click-animation-style';
        styleElement.textContent = `
            @keyframes clickRipple {
                0% {
                    transform: scale(0.5);
                    opacity: 1;
                }
                100% {
                    transform: scale(1.5);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(styleElement);
    }
    
    // 添加到文档
    document.body.appendChild(clickEffect);
    
    // 动画结束后移除元素
    setTimeout(() => {
        if (clickEffect.parentNode) {
            clickEffect.parentNode.removeChild(clickEffect);
        }
    }, 600);
}

// 初始化摄像头
async function setupCamera() {
    updateStatus("Starting camera...");
    
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
        console.error("Unable to access camera:", error);
        updateStatus("Unable to access camera, please ensure permission");
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
    calculator.style.padding = '40px'; // 从25px增加到40px，使黑色区域更宽
    calculator.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
    calculator.style.zIndex = '1000'; // 这个值小于画布的z-index
    calculator.style.width = '500px'; // 从250px修改为500px，增加到两倍大
    calculator.style.cursor = 'move'; // 添加移动光标样式，表示可拖动
    
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
        
        // 注释掉鼠标悬停效果
        /*
        button.addEventListener('mouseover', () => {
            button.style.opacity = '0.8';
        });
        
        button.addEventListener('mouseout', () => {
            button.style.opacity = '1';
        });
        */
        
        // 确保按钮始终有点击响应
        button.addEventListener('click', (e) => {
            console.log('Calculator button clicked directly:', btn);
            // 现有逻辑在buttonGrid的事件委托中处理
        });
        
        buttonGrid.appendChild(button);
    });
    
    calculator.appendChild(buttonGrid);
    
    // 添加拖动功能 - 重命名变量以避免与手势拖拽的冲突
    let isCalcDragging = false; // 更改变量名称
    let calcDragOffsetX, calcDragOffsetY;

    // 鼠标按下事件 - 开始拖动
    calculator.addEventListener('mousedown', (e) => {
        // 只有当点击的不是按钮时才允许拖动
        if (!e.target.classList.contains('calc-button')) {
            isCalcDragging = true; // 使用新变量名
            
            // 计算鼠标位置与计算器左上角的偏移
            const rect = calculator.getBoundingClientRect();
            calcDragOffsetX = e.clientX - rect.left;
            calcDragOffsetY = e.clientY - rect.top;
            
            // 提高拖动时的z-index，确保在拖动时位于顶层
            calculator.style.zIndex = '1001';
            
            console.log('Starting calculator drag');
            
            // 防止文本选择等默认行为
            e.preventDefault();
        }
    });

    // 鼠标移动事件 - 拖动中
    document.addEventListener('mousemove', (e) => {
        if (isCalcDragging) { // 使用新变量名
            // 使用requestAnimationFrame确保平滑渲染且不阻塞主线程
            requestAnimationFrame(() => {
                // 计算新位置
                const newLeft = e.clientX - calcDragOffsetX;
                const newTop = e.clientY - calcDragOffsetY;
                
                // 应用新位置
                calculator.style.right = 'auto'; // 取消right定位，改为使用left
                calculator.style.left = `${newLeft}px`;
                calculator.style.top = `${newTop}px`;
            });
        }
    });

    // 鼠标释放事件 - 结束拖动
    document.addEventListener('mouseup', () => {
        if (isCalcDragging) { // 使用新变量名
            isCalcDragging = false;
            // 恢复原来的z-index
            calculator.style.zIndex = '1000';
            console.log('Stopping calculator drag');
        }
    });

    // 确保拖动离开窗口时也能停止
    document.addEventListener('mouseleave', () => {
        if (isCalcDragging) { // 使用新变量名
            isCalcDragging = false;
            // 恢复原来的z-index
            calculator.style.zIndex = '1000';
            console.log('Stopping calculator drag (leaving window)');
        }
    });
    
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

// 创建侧边导航面板
function createSidebar() {
    // 创建侧边栏容器
    const sidebar = document.createElement('div');
    sidebar.id = 'sidebar';
    sidebar.style.position = 'fixed';
    sidebar.style.top = '0';
    sidebar.style.left = '0';
    sidebar.style.width = '350px';
    sidebar.style.height = '100%';
    sidebar.style.backgroundColor = 'rgba(240, 240, 247, 0.9)'; // 苹果风格背景色
    sidebar.style.backdropFilter = 'blur(10px)'; // 毛玻璃效果
    sidebar.style.webkitBackdropFilter = 'blur(10px)'; // Safari支持
    sidebar.style.zIndex = '999'; // 低于画布但高于大多数元素
    sidebar.style.padding = '20px';
    sidebar.style.boxShadow = '0 0 20px rgba(0, 0, 0, 0.1)';
    sidebar.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    sidebar.style.display = 'flex';
    sidebar.style.flexDirection = 'column';
    sidebar.style.gap = '20px';
    
    // 添加标题
    const title = document.createElement('h1');
    title.textContent = 'Gesture Control Web App';
    title.style.fontSize = '18px';
    title.style.fontWeight = '600';
    title.style.margin = '0';
    title.style.color = '#1d1d1f';
    title.style.paddingBottom = '10px';
    title.style.borderBottom = '1px solid rgba(0, 0, 0, 0.1)';
    sidebar.appendChild(title);
    
    // 创建计算器控制项
    const controlItem = document.createElement('div');
    controlItem.style.display = 'flex';
    controlItem.style.justifyContent = 'space-between';
    controlItem.style.alignItems = 'center';
    controlItem.style.padding = '10px 0';
    
    // 计算器标签
    const label = document.createElement('label');
    label.textContent = 'Calculator';
    label.style.fontSize = '22px';
    label.style.fontWeight = '500';
    label.style.color = '#1d1d1f';
    
    // 创建开关
    const toggleSwitch = document.createElement('div');
    toggleSwitch.className = 'toggle-switch';
    toggleSwitch.style.position = 'relative';
    toggleSwitch.style.width = '80px';
    toggleSwitch.style.height = '50px';
    toggleSwitch.style.backgroundColor = '#34c759'; // 苹果风格绿色
    toggleSwitch.style.borderRadius = '25px';
    toggleSwitch.style.cursor = 'pointer';
    toggleSwitch.style.transition = 'background-color 0.3s';
    
    // 创建开关滑块
    const slider = document.createElement('div');
    slider.style.position = 'absolute';
    slider.style.top = '3px';
    slider.style.left = '34px';
    slider.style.width = '44px';
    slider.style.height = '44px';
    slider.style.borderRadius = '50%';
    slider.style.backgroundColor = 'white';
    slider.style.boxShadow = '0 3px 8px rgba(0, 0, 0, 0.2)';
    slider.style.transition = 'left 0.3s';
    toggleSwitch.appendChild(slider);
    
    // 默认计算器是显示的
    let calculatorVisible = true;
    const calculator = document.getElementById('calculator') || { style: {} }; // 防止null错误
    
    // 添加开关点击事件
    toggleSwitch.addEventListener('click', () => {
        calculatorVisible = !calculatorVisible;
        
        // 更新开关外观
        if (calculatorVisible) {
            toggleSwitch.style.backgroundColor = '#34c759'; // 绿色
            slider.style.left = '34px';
        } else {
            toggleSwitch.style.backgroundColor = '#e9e9ea'; // 灰色
            slider.style.left = '3px';
        }
        
        // 控制计算器显示
        const calculator = document.getElementById('calculator');
        if (calculator) {
            calculator.style.display = calculatorVisible ? 'block' : 'none';
        }
    });
    
    controlItem.appendChild(label);
    controlItem.appendChild(toggleSwitch);
    sidebar.appendChild(controlItem);
    
    // 创建空间控制项
    const spaceControlItem = document.createElement('div');
    spaceControlItem.style.display = 'flex';
    spaceControlItem.style.justifyContent = 'space-between';
    spaceControlItem.style.alignItems = 'center';
    spaceControlItem.style.padding = '10px 0';
    spaceControlItem.style.borderTop = '1px solid rgba(0, 0, 0, 0.1)';
    spaceControlItem.style.marginTop = '10px';
    
    // 空间标签
    const spaceLabel = document.createElement('label');
    spaceLabel.textContent = 'Space';
    spaceLabel.style.fontSize = '22px';
    spaceLabel.style.fontWeight = '500';
    spaceLabel.style.color = '#1d1d1f';
    
    // 创建空间开关
    const spaceToggleSwitch = document.createElement('div');
    spaceToggleSwitch.id = 'space-toggle';
    spaceToggleSwitch.className = 'toggle-switch';
    spaceToggleSwitch.style.position = 'relative';
    spaceToggleSwitch.style.width = '80px';
    spaceToggleSwitch.style.height = '50px';
    spaceToggleSwitch.style.backgroundColor = '#e9e9ea'; // 默认是灰色（关闭状态）
    spaceToggleSwitch.style.borderRadius = '25px';
    spaceToggleSwitch.style.cursor = 'pointer';
    spaceToggleSwitch.style.transition = 'background-color 0.3s';
    
    // 创建空间开关滑块
    const spaceSlider = document.createElement('div');
    spaceSlider.style.position = 'absolute';
    spaceSlider.style.top = '3px';
    spaceSlider.style.left = '3px'; // 默认在左侧（关闭状态）
    spaceSlider.style.width = '44px';
    spaceSlider.style.height = '44px';
    spaceSlider.style.borderRadius = '50%';
    spaceSlider.style.backgroundColor = 'white';
    spaceSlider.style.boxShadow = '0 3px 8px rgba(0, 0, 0, 0.2)';
    spaceSlider.style.transition = 'left 0.3s';
    spaceToggleSwitch.appendChild(spaceSlider);
    
    // 空间组件的显示/隐藏状态
    let spaceVisible = false;
    const spaceComponent = document.getElementById('space-component');
    
    // 添加空间开关点击事件
    spaceToggleSwitch.addEventListener('click', () => {
        spaceVisible = !spaceVisible;
        
        // 更新开关外观
        if (spaceVisible) {
            spaceToggleSwitch.style.backgroundColor = '#34c759'; // 绿色
            spaceSlider.style.left = '34px';
            if (spaceComponent) {
                spaceComponent.classList.remove('hidden');
            }
        } else {
            spaceToggleSwitch.style.backgroundColor = '#e9e9ea'; // 灰色
            spaceSlider.style.left = '3px';
            if (spaceComponent) {
                spaceComponent.classList.add('hidden');
            }
        }
    });
    
    spaceControlItem.appendChild(spaceLabel);
    spaceControlItem.appendChild(spaceToggleSwitch);
    sidebar.appendChild(spaceControlItem);
    
    // 创建录屏控制项
    const videoControlItem = document.createElement('div');
    videoControlItem.style.display = 'flex';
    videoControlItem.style.justifyContent = 'space-between';
    videoControlItem.style.alignItems = 'center';
    videoControlItem.style.padding = '10px 0';
    videoControlItem.style.borderTop = '1px solid rgba(0, 0, 0, 0.1)';
    videoControlItem.style.marginTop = '10px';
    
    // 录屏标签
    const videoLabel = document.createElement('label');
    videoLabel.textContent = 'Camera Video';
    videoLabel.style.fontSize = '22px';
    videoLabel.style.fontWeight = '500';
    videoLabel.style.color = '#1d1d1f';
    
    // 录屏组件的显示/隐藏状态
    let videoVisible = false; // 修改为false，默认隐藏
    const inputVideo = document.getElementById('input-video');
    // 初始化时立即隐藏视频元素
    if (inputVideo) {
        inputVideo.style.display = 'none';
    }
    
    // 创建录屏开关
    const videoToggleSwitch = document.createElement('div');
    videoToggleSwitch.id = 'video-toggle';
    videoToggleSwitch.className = 'toggle-switch';
    videoToggleSwitch.style.position = 'relative';
    videoToggleSwitch.style.width = '80px';
    videoToggleSwitch.style.height = '50px';
    videoToggleSwitch.style.backgroundColor = '#e9e9ea'; // 修改为灰色（关闭状态）
    videoToggleSwitch.style.borderRadius = '25px';
    videoToggleSwitch.style.cursor = 'pointer';
    videoToggleSwitch.style.transition = 'background-color 0.3s';
    
    // 创建录屏开关滑块
    const videoSlider = document.createElement('div');
    videoSlider.style.position = 'absolute';
    videoSlider.style.top = '3px';
    videoSlider.style.left = '3px'; // 修改为左侧位置（关闭状态）
    videoSlider.style.width = '44px';
    videoSlider.style.height = '44px';
    videoSlider.style.borderRadius = '50%';
    videoSlider.style.backgroundColor = 'white';
    videoSlider.style.boxShadow = '0 3px 8px rgba(0, 0, 0, 0.2)';
    videoSlider.style.transition = 'left 0.3s';
    videoToggleSwitch.appendChild(videoSlider);
    
    // 添加录屏开关点击事件
    videoToggleSwitch.addEventListener('click', () => {
        videoVisible = !videoVisible;
        
        // 更新开关外观
        if (videoVisible) {
            videoToggleSwitch.style.backgroundColor = '#34c759'; // 绿色
            videoSlider.style.left = '34px';
            if (inputVideo) {
                inputVideo.style.display = 'block';
            }
        } else {
            videoToggleSwitch.style.backgroundColor = '#e9e9ea'; // 灰色
            videoSlider.style.left = '3px';
            if (inputVideo) {
                inputVideo.style.display = 'none';
            }
        }
    });
    
    videoControlItem.appendChild(videoLabel);
    videoControlItem.appendChild(videoToggleSwitch);
    sidebar.appendChild(videoControlItem);
    
    // 创建医院病人监测控制项
    const hospitalMonitorItem = document.createElement('div');
    hospitalMonitorItem.style.display = 'flex';
    hospitalMonitorItem.style.justifyContent = 'space-between';
    hospitalMonitorItem.style.alignItems = 'center';
    hospitalMonitorItem.style.padding = '10px 0';
    hospitalMonitorItem.style.borderTop = '1px solid rgba(0, 0, 0, 0.1)';
    hospitalMonitorItem.style.marginTop = '10px';
    
    // 医院监测标签
    const hospitalLabel = document.createElement('label');
    hospitalLabel.textContent = 'Hospital Patient Monitor';
    hospitalLabel.style.fontSize = '22px';
    hospitalLabel.style.fontWeight = '500';
    hospitalLabel.style.color = '#1d1d1f';
    
    // 医院监测组件的显示/隐藏状态
    let hospitalMonitorVisible = false; // 默认隐藏
    
    // 创建医院监测开关
    const hospitalToggleSwitch = document.createElement('div');
    hospitalToggleSwitch.id = 'hospital-toggle';
    hospitalToggleSwitch.className = 'toggle-switch';
    hospitalToggleSwitch.style.position = 'relative';
    hospitalToggleSwitch.style.width = '80px';
    hospitalToggleSwitch.style.height = '50px';
    hospitalToggleSwitch.style.backgroundColor = '#e9e9ea'; // 默认是灰色（关闭状态）
    hospitalToggleSwitch.style.borderRadius = '25px';
    hospitalToggleSwitch.style.cursor = 'pointer';
    hospitalToggleSwitch.style.transition = 'background-color 0.3s';
    
    // 创建医院监测开关滑块
    const hospitalSlider = document.createElement('div');
    hospitalSlider.style.position = 'absolute';
    hospitalSlider.style.top = '3px';
    hospitalSlider.style.left = '3px'; // 默认在左侧（关闭状态）
    hospitalSlider.style.width = '44px';
    hospitalSlider.style.height = '44px';
    hospitalSlider.style.borderRadius = '50%';
    hospitalSlider.style.backgroundColor = 'white';
    hospitalSlider.style.boxShadow = '0 3px 8px rgba(0, 0, 0, 0.2)';
    hospitalSlider.style.transition = 'left 0.3s';
    hospitalToggleSwitch.appendChild(hospitalSlider);
    
    // 创建医院监测面板
    const hospitalMonitorPanel = document.createElement('div');
    hospitalMonitorPanel.id = 'hospital-monitor-panel';
    hospitalMonitorPanel.style.position = 'fixed';
    hospitalMonitorPanel.style.right = '20px';
    hospitalMonitorPanel.style.top = '50%';
    hospitalMonitorPanel.style.transform = 'translateY(-50%)';
    hospitalMonitorPanel.style.width = 'calc(80% - 300px)'; // 考虑左侧边栏和边距
    hospitalMonitorPanel.style.height = '85vh';
    hospitalMonitorPanel.style.backgroundColor = 'white';
    hospitalMonitorPanel.style.borderRadius = '12px';
    hospitalMonitorPanel.style.boxShadow = '0 5px 20px rgba(0, 0, 0, 0.15)';
    hospitalMonitorPanel.style.display = 'none'; // 默认隐藏
    hospitalMonitorPanel.style.zIndex = '900';
    hospitalMonitorPanel.style.padding = '20px';
    document.body.appendChild(hospitalMonitorPanel);
    
    // 添加医院监测开关点击事件
    hospitalToggleSwitch.addEventListener('click', () => {
        hospitalMonitorVisible = !hospitalMonitorVisible;
        
        // 更新开关外观
        if (hospitalMonitorVisible) {
            hospitalToggleSwitch.style.backgroundColor = '#34c759'; // 绿色
            hospitalSlider.style.left = '34px';
            hospitalMonitorPanel.style.display = 'block';
        } else {
            hospitalToggleSwitch.style.backgroundColor = '#e9e9ea'; // 灰色
            hospitalSlider.style.left = '3px';
            hospitalMonitorPanel.style.display = 'none';
        }
    });
    
    hospitalMonitorItem.appendChild(hospitalLabel);
    hospitalMonitorItem.appendChild(hospitalToggleSwitch);
    sidebar.appendChild(hospitalMonitorItem);
    
    return sidebar;
}

// 创建虚拟宇宙和地球
function createVirtualEarth() {
    const container = document.getElementById('earth-container');
    if (!container) return;

    // 创建场景
    const scene = new THREE.Scene();
    earthScene = scene;
    
    // 设置相机
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.z = 5;
    earthCamera = camera;
    
    // 创建渲染器
    const renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true,
        logarithmicDepthBuffer: true // 提高深度缓冲精度，防止渲染错误
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0); // 透明背景
    renderer.setPixelRatio(window.devicePixelRatio); // 适应高分辨率屏幕
    container.appendChild(renderer.domElement);

    // 设置渲染器的 DOM 元素样式
    renderer.domElement.style.borderRadius = '8px'; // 匹配 Space 组件的圆角
    renderer.domElement.style.overflow = 'hidden'; // 防止内容溢出
    
    // 添加环境光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    // 添加平行光（模拟太阳光）
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 3, 5);
    scene.add(directionalLight);
    
    // 创建星空背景
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 2000; // 增加星星数量，使星空更密集
    const starPositions = new Float32Array(starCount * 3);
    
    for (let i = 0; i < starCount; i++) {
        const i3 = i * 3;
        // 在球面上随机分布星星，减小半径使其看起来更像组件内的背景
        const radius = 50 + Math.random() * 30; // 减小半径范围
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        
        starPositions[i3] = radius * Math.sin(phi) * Math.cos(theta);
        starPositions[i3+1] = radius * Math.sin(phi) * Math.sin(theta);
        starPositions[i3+2] = radius * Math.cos(phi);
    }
    
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.15, // 增大星星大小，让它们更明显
        sizeAttenuation: true // 确保远处的星星看起来更小
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);
    
    // 创建地球
    const earthGeometry = new THREE.SphereGeometry(1, 64, 64);
    
    // 加载地球纹理
    const textureLoader = new THREE.TextureLoader();
    const earthTexture = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg');
    const earthBumpMap = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_normal_2048.jpg');
    const earthSpecMap = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_specular_2048.jpg');
    
    const earthMaterial = new THREE.MeshPhongMaterial({
        map: earthTexture,
        bumpMap: earthBumpMap,
        bumpScale: 0.05,
        specularMap: earthSpecMap,
        specular: new THREE.Color('grey'),
        shininess: 10
    });
    
    const earth = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earth);
    earthObj = earth; // 保存地球引用
    
    // 添加云层
    const cloudGeometry = new THREE.SphereGeometry(1.02, 64, 64);
    const cloudTexture = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_clouds_2048.jpg');
    const cloudMaterial = new THREE.MeshPhongMaterial({
        map: cloudTexture,
        transparent: true,
        opacity: 0.4
    });
    
    const clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
    scene.add(clouds);
    cloudsObj = clouds; // 保存云层引用
    
    // 添加轨道控制器，让用户可以旋转和缩放场景
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 1.5;
    controls.maxDistance = 15;
    controls.enableRotate = true;
    controls.rotateSpeed = 1.0; // 增加旋转速度
    earthControls = controls; // 保存控制器引用
    
    // 动画函数
    function animate() {
        requestAnimationFrame(animate);
        
        // 地球自转 - 进一步降低自转速度
        earth.rotation.y += 0.0001; // 从0.0002再降低到0.0001
        clouds.rotation.y += 0.00015; // 从0.0003再降低到0.00015
        
        controls.update();
        renderer.render(scene, camera);
    }
    
    // 开始动画
    animate();
    
    // 处理窗口大小变化
    function handleResize() {
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }
    
    window.addEventListener('resize', handleResize);
    
    // 当space-component变为可见时，触发一次resize以适应容器
    const spaceToggleSwitch = document.getElementById('space-toggle');
    if (spaceToggleSwitch) {
        spaceToggleSwitch.addEventListener('click', () => {
            setTimeout(handleResize, 100); // 给DOM一点时间来更新
        });
    }
}

// 添加直接控制地球旋转的函数
function rotateEarth(startX, startY, currentX, currentY) {
    if (!earthObj) return;
    
    // 计算拖动距离并转换为旋转角度
    const deltaX = currentX - startX;
    const deltaY = currentY - startY;
    
    // 直接控制地球旋转 - 进一步降低旋转速度
    earthObj.rotation.y += deltaX * 0.001; // 从0.003降低到0.001
    earthObj.rotation.x += deltaY * 0.001; // 从0.003降低到0.001
    
    // 同步云层旋转
    if (cloudsObj) {
        cloudsObj.rotation.y = earthObj.rotation.y;
        cloudsObj.rotation.x = earthObj.rotation.x;
    }
}

// 启动应用
async function startApp() {
    try {
        await setupCamera();
        initializeHands();
        
        updateStatus("Initializing...");
        
        // 创建摄像头实例
        camera = new Camera(video, {
            onFrame: async () => {
                await hands.send({image: video});
            },
            width: 640,
            height: 480
        });
        
        await camera.start();
        updateStatus("No Hand Detected");
        
        // 创建计算器
        createCalculator();
        
        // 创建侧边导航面板
        const sidebar = createSidebar();
        document.body.appendChild(sidebar);
        
        // 创建虚拟宇宙和地球
        createVirtualEarth();
        
        // 初始化医院监测面板内容
        initializeHospitalMonitor();
    } catch (error) {
        console.error("Application start failed:", error);
        updateStatus("Application start failed, please refresh the page");
    }
}

// 启动应用
window.addEventListener('load', startApp);

// 触发拖拽开始
function triggerDragStart(x, y) {
    console.log('Starting drag operation:', x, y);
    
    // 创建拖拽开始反馈效果
    createClickEffect(x, y, 'rgba(255, 100, 0, 0.5)'); // 橙色表示拖拽开始
    
    // 保存初始拖拽位置
    window._dragStartPosition = {x, y};
    
    // 如果dragElement为null但有_lastPinchElement，使用它
    if (!dragElement && window._lastPinchElement) {
        dragElement = window._lastPinchElement;
    }
    
    if (dragElement) {
        console.log('Dragging element:', dragElement.tagName, dragElement.className);
        
        // 如果元素有定位，保存其初始位置
        const style = window.getComputedStyle(dragElement);
        const position = style.position;
        
        // 如果元素没有定位或是static，改为relative
        if (position === 'static' || position === '') {
            dragElement.style.position = 'relative';
            dragElement._originalPosition = position;
            dragElement._dragOffset = {x: 0, y: 0};
        } 
        // 如果已经有绝对/相对定位，记录原始offset
        else if (position === 'absolute' || position === 'fixed') {
            dragElement._dragOffset = {
                x: parseInt(style.left) || 0,
                y: parseInt(style.top) || 0
            };
        } 
        else if (position === 'relative') {
            dragElement._dragOffset = {
                x: parseInt(style.left) || 0,
                y: parseInt(style.top) || 0
            };
        }
        
        // 应用拖拽样式
        dragElement.style.cursor = 'grabbing';
        dragElement.style.userSelect = 'none';
        dragElement._originalZIndex = dragElement.style.zIndex;
        dragElement.style.zIndex = '1500'; // 确保拖拽时元素在最上层
        
        // 确保元素位置已经设置好，防止第一次拖拽失败
        if (!dragElement.style.left) {
            dragElement.style.left = dragElement._dragOffset.x + 'px';
        }
        if (!dragElement.style.top) {
            dragElement.style.top = dragElement._dragOffset.y + 'px';
        }
    } else {
        console.warn('No element to drag found!');
    }
}

// 触发拖拽移动
function triggerDragMove(x, y) {
    if (!dragElement || !window._dragStartPosition) return;
    
    // 计算移动的距离
    const deltaX = x - window._dragStartPosition.x;
    const deltaY = y - window._dragStartPosition.y;
    
    // 应用移动
    const newX = dragElement._dragOffset.x + deltaX;
    const newY = dragElement._dragOffset.y + deltaY;
    
    // 更新元素位置，使用requestAnimationFrame确保平滑渲染
    requestAnimationFrame(() => {
        dragElement.style.left = `${newX}px`;
        dragElement.style.top = `${newY}px`;
    });
}

// 触发拖拽结束
function triggerDragEnd(x, y) {
    console.log('Ending drag operation:', x, y);
    
    // 创建拖拽结束反馈效果
    createClickEffect(x, y, 'rgba(100, 255, 100, 0.5)'); // 绿色表示拖拽结束
    
    if (dragElement) {
        // 恢复元素样式
        dragElement.style.cursor = '';
        dragElement.style.userSelect = '';
        dragElement.style.zIndex = dragElement._originalZIndex || '';
        
        // 保存最终位置作为新的偏移
        const style = window.getComputedStyle(dragElement);
        dragElement._dragOffset = {
            x: parseInt(style.left) || 0,
            y: parseInt(style.top) || 0
        };
        
        console.log('Drag ended, element position:', dragElement._dragOffset);
    }
    
    // 清除拖拽数据
    window._dragStartPosition = null;
}

// 初始化医院监测面板内容
function initializeHospitalMonitor() {
    const panel = document.getElementById('hospital-monitor-panel');
    if (!panel) return;
    
    // 设置监护仪整体风格 - 模仿MindRay设备的深色背景
    panel.style.backgroundColor = '#0E1621';
    panel.style.color = '#FFFFFF';
    panel.style.fontFamily = 'Arial, sans-serif';
    panel.style.overflow = 'hidden';
    
    // 添加MindRay logo和设备型号
    const headerBar = document.createElement('div');
    headerBar.style.display = 'flex';
    headerBar.style.justifyContent = 'space-between';
    headerBar.style.alignItems = 'center';
    headerBar.style.padding = '10px 15px';
    headerBar.style.backgroundColor = '#0A1018';
    headerBar.style.borderBottom = '1px solid #2A3A4A';
    
    const logoDiv = document.createElement('div');
    logoDiv.innerHTML = '<span style="color:#5CAAEE; font-weight:bold; font-size:22px;">MindRay-Like Gesture Control HPM</span>';
    logoDiv.style.display = 'flex';
    logoDiv.style.alignItems = 'center';
    
    const deviceModel = document.createElement('div');
    deviceModel.textContent = 'BeneView T8';
    deviceModel.style.fontSize = '14px';
    deviceModel.style.color = '#9AADC8';
    
    const dateTimeDiv = document.createElement('div');
    dateTimeDiv.style.fontSize = '14px';
    dateTimeDiv.style.color = '#9AADC8';
    
    // 更新时间函数
    function updateDateTime() {
        const now = new Date();
        dateTimeDiv.textContent = now.toLocaleString();
    }
    
    setInterval(updateDateTime, 1000);
    updateDateTime();
    
    headerBar.appendChild(logoDiv);
    headerBar.appendChild(deviceModel);
    headerBar.appendChild(dateTimeDiv);
    panel.appendChild(headerBar);
    
    // 添加患者信息栏
    const patientBar = document.createElement('div');
    patientBar.style.display = 'flex';
    patientBar.style.justifyContent = 'space-between';
    patientBar.style.padding = '8px 15px';
    patientBar.style.backgroundColor = '#1A2736';
    patientBar.style.color = '#D0E3FF';
    patientBar.style.fontSize = '14px';
    
    patientBar.innerHTML = `
        <div style="display: flex; gap: 20px;">
            <div><strong>Patient:</strong> John Doe</div>
            <div><strong>ID:</strong> 12345678</div>
            <div><strong>Age:</strong> 45</div>
            <div><strong>Gender:</strong> Male</div>
        </div>
        <div style="display: flex; gap: 20px;">
            <div><strong>Room:</strong> 302-A</div>
            <div><strong>Doctor:</strong> Dr. Smith</div>
            <div><strong>Blood Type:</strong> A+</div>
        </div>
    `;
    
    panel.appendChild(patientBar);
    
    // 创建主监控区域
    const monitorContainer = document.createElement('div');
    monitorContainer.style.display = 'flex';
    monitorContainer.style.height = 'calc(100% - 120px)';
    panel.appendChild(monitorContainer);
    
    // 创建左侧波形区域 (占70%)
    const waveformsArea = document.createElement('div');
    waveformsArea.style.flex = '7';
    waveformsArea.style.display = 'flex';
    waveformsArea.style.flexDirection = 'column';
    waveformsArea.style.padding = '10px';
    waveformsArea.style.gap = '10px';
    waveformsArea.style.borderRight = '1px solid #2A3A4A';
    monitorContainer.appendChild(waveformsArea);
    
    // 创建右侧数值区域 (占30%)
    const numericsArea = document.createElement('div');
    numericsArea.style.flex = '3';
    numericsArea.style.padding = '10px';
    numericsArea.style.display = 'flex';
    numericsArea.style.flexDirection = 'column';
    numericsArea.style.gap = '10px';
    monitorContainer.appendChild(numericsArea);
    
    // 添加ECG波形区域
    const ecgContainer = createWaveformContainer('ECG II', '#5CAAEE', 'mV');
    const ecgCanvas = ecgContainer.querySelector('canvas');
    waveformsArea.appendChild(ecgContainer);
    
    // 添加呼吸波形区域
    const respContainer = createWaveformContainer('RESP', '#4CD964', 'rpm');
    const respCanvas = respContainer.querySelector('canvas');
    waveformsArea.appendChild(respContainer);
    
    // 添加SpO2波形区域
    const spo2Container = createWaveformContainer('SpO₂', '#FF9500', '%');
    const spo2Canvas = spo2Container.querySelector('canvas');
    waveformsArea.appendChild(spo2Container);
    
    // 添加血压波形区域
    const nibpContainer = createWaveformContainer('NIBP', '#FF2D55', 'mmHg');
    const nibpCanvas = nibpContainer.querySelector('canvas');
    waveformsArea.appendChild(nibpContainer);
    
    // 添加数值区域的生命体征参数
    // 心率
    numericsArea.appendChild(createParameterBox('HR', '72', 'bpm', '#5CAAEE', '60-100', '40', '120'));
    
    // 呼吸
    numericsArea.appendChild(createParameterBox('RESP', '18', 'rpm', '#4CD964', '12-20', '8', '25'));
    
    // 血氧
    numericsArea.appendChild(createParameterBox('SpO₂', '98', '%', '#FF9500', '95-100', '90', '100'));
    
    // 血压
    const bpBox = createParameterBox('NIBP', '', '', '#FF2D55', '', '', '');
    bpBox.querySelector('.value-container').innerHTML = `
        <div style="display: flex; justify-content: space-between; width: 100%;">
            <div>
                <span style="font-size: 16px; color: #AAA;">SYS</span>
                <div style="font-size: 28px; font-weight: bold; color: #FF2D55;">120</div>
            </div>
            <div>
                <span style="font-size: 16px; color: #AAA;">DIA</span>
                <div style="font-size: 28px; font-weight: bold; color: #FF2D55;">80</div>
            </div>
            <div>
                <span style="font-size: 16px; color: #AAA;">MAP</span>
                <div style="font-size: 28px; font-weight: bold; color: #FF2D55;">93</div>
            </div>
        </div>
        <div style="font-size: 12px; color: #888; margin-top: 5px;">mmHg</div>
    `;
    numericsArea.appendChild(bpBox);
    
    // 体温
    numericsArea.appendChild(createParameterBox('TEMP', '36.8', '°C', '#34C759', '36.5-37.5', '35.5', '38.0'));
    
    // 创建底部警报与消息区域
    const alertBar = document.createElement('div');
    alertBar.style.backgroundColor = '#1A2736';
    alertBar.style.padding = '8px 15px';
    alertBar.style.borderTop = '1px solid #2A3A4A';
    alertBar.style.display = 'flex';
    alertBar.style.justifyContent = 'space-between';
    alertBar.style.fontSize = '14px';
    alertBar.style.color = '#9AADC8';
    alertBar.innerHTML = `
        <div>All alarms active</div>
        <div>Adult mode</div>
        <div>Network: Connected</div>
        <div>Battery: 80%</div>
    `;
    panel.appendChild(alertBar);
    
    // 启动所有波形动画
    startECGSimulation(ecgCanvas);
    startRespirationSimulation(respCanvas);
    startSpO2Simulation(spo2Canvas);
    startNIBPSimulation(nibpCanvas);
    
    // 定时更新数值（模拟实时数据）
    setInterval(() => {
        updateVitalSigns(numericsArea);
    }, 5000);
}

// 创建波形容器
function createWaveformContainer(title, color, unit) {
    const container = document.createElement('div');
    container.style.flex = '1';
    container.style.backgroundColor = 'transparent';
    container.style.borderRadius = '5px';
    container.style.border = '1px solid rgba(255, 255, 255, 0.2)';
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    
    // 添加标题和单位
    const labelContainer = document.createElement('div');
    labelContainer.style.position = 'absolute';
    labelContainer.style.top = '5px';
    labelContainer.style.left = '10px';
    labelContainer.style.display = 'flex';
    labelContainer.style.gap = '10px';
    labelContainer.style.alignItems = 'center';
    labelContainer.style.zIndex = '1';
    
    const titleElem = document.createElement('div');
    titleElem.textContent = title;
    titleElem.style.fontWeight = 'bold';
    titleElem.style.color = color;
    titleElem.style.fontSize = '14px';
    labelContainer.appendChild(titleElem);
    
    const unitElem = document.createElement('div');
    unitElem.textContent = unit;
    unitElem.style.color = '#888';
    unitElem.style.fontSize = '12px';
    labelContainer.appendChild(unitElem);
    
    container.appendChild(labelContainer);
    
    // 添加当前值
    const valueContainer = document.createElement('div');
    valueContainer.style.position = 'absolute';
    valueContainer.style.top = '5px';
    valueContainer.style.right = '10px';
    valueContainer.style.fontWeight = 'bold';
    valueContainer.style.fontSize = '18px';
    valueContainer.style.color = color;
    container.appendChild(valueContainer);
    
    // 如果是ECG，显示心率
    if (title === 'ECG II') {
        valueContainer.textContent = '72';
    } else if (title === 'RESP') {
        valueContainer.textContent = '18';
    } else if (title === 'SpO₂') {
        valueContainer.textContent = '98';
    } else if (title === 'NIBP') {
        valueContainer.textContent = '120/80';
    }
    
    // 添加网格背景
    const gridCanvas = document.createElement('canvas');
    gridCanvas.style.position = 'absolute';
    gridCanvas.style.top = '0';
    gridCanvas.style.left = '0';
    gridCanvas.style.width = '100%';
    gridCanvas.style.height = '100%';
    gridCanvas.width = 1000; // 将在resize时调整
    gridCanvas.height = 200;
    container.appendChild(gridCanvas);
    
    // 绘制网格
    const gridCtx = gridCanvas.getContext('2d');
    gridCtx.strokeStyle = 'rgba(80, 100, 120, 0.2)';
    gridCtx.lineWidth = 1;
    
    // 横线
    for (let y = 0; y < gridCanvas.height; y += 20) {
        gridCtx.beginPath();
        gridCtx.moveTo(0, y);
        gridCtx.lineTo(gridCanvas.width, y);
        gridCtx.stroke();
    }
    
    // 竖线
    for (let x = 0; x < gridCanvas.width; x += 20) {
        gridCtx.beginPath();
        gridCtx.moveTo(x, 0);
        gridCtx.lineTo(x, gridCanvas.height);
        gridCtx.stroke();
    }
    
    // 波形画布
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.backgroundColor = 'transparent';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.width = 1000; // 将在resize时调整
    canvas.height = 200;
    container.appendChild(canvas);
    
    return container;
}

// 创建参数框 - 符合ISO 62366-1:2015标准
function createParameterBox(title, value, unit, color, normalRange, lowLimit, highLimit) {
    const box = document.createElement('div');
    box.style.backgroundColor = '#121E2A';
    box.style.borderRadius = '5px';
    box.style.padding = '10px';
    box.style.display = 'flex';
    box.style.flexDirection = 'column';
    // 增加1px实线边框以符合ISO标准
    box.style.border = `1px solid ${color}`;
    // 记录正常范围值
    box.dataset.normalRange = normalRange;
    box.dataset.lowLimit = lowLimit;
    box.dataset.highLimit = highLimit;
    
    // 参数标题行 - 符合ISO标准
    const titleRow = document.createElement('div');
    titleRow.style.display = 'flex';
    titleRow.style.justifyContent = 'space-between';
    titleRow.style.marginBottom = '5px';
    titleRow.style.alignItems = 'center';
    
    const titleElem = document.createElement('div');
    titleElem.textContent = title;
    titleElem.style.fontWeight = 'bold';
    titleElem.style.color = color;
    titleElem.style.fontSize = '16px';
    titleRow.appendChild(titleElem);
    
    // 增加告警状态指示器 - 符合ISO标准
    const alarmStatusIndicator = document.createElement('div');
    alarmStatusIndicator.style.display = 'flex';
    alarmStatusIndicator.style.alignItems = 'center';
    alarmStatusIndicator.style.gap = '5px';
    
    // 告警开关状态
    const alarmStatusIcon = document.createElement('span');
    alarmStatusIcon.textContent = '🔔';
    alarmStatusIcon.style.fontSize = '12px';
    alarmStatusIcon.style.color = '#4CD964';
    alarmStatusIcon.title = 'Alarms enabled';
    alarmStatusIndicator.appendChild(alarmStatusIcon);
    
    // 正常范围显示
    const rangeElem = document.createElement('div');
    rangeElem.style.fontSize = '12px';
    rangeElem.style.color = '#888';
    rangeElem.textContent = lowLimit ? `${lowLimit} - ${highLimit}` : '';
    rangeElem.style.marginLeft = '5px';
    alarmStatusIndicator.appendChild(rangeElem);
    
    titleRow.appendChild(alarmStatusIndicator);
    box.appendChild(titleRow);
    
    // 参数值容器
    const valueContainer = document.createElement('div');
    valueContainer.className = 'value-container';
    valueContainer.style.display = 'flex';
    valueContainer.style.alignItems = 'flex-end';
    valueContainer.style.gap = '5px';
    
    // 根据是否在正常范围内设置颜色
    const isInRange = (val) => {
        if (!lowLimit || !highLimit) return true;
        const numVal = parseFloat(val);
        return numVal >= parseFloat(lowLimit) && numVal <= parseFloat(highLimit);
    };
    
    // 根据测量值判断告警状态，并设置颜色
    const valueElem = document.createElement('div');
    valueElem.textContent = value;
    valueElem.style.fontSize = '32px';
    valueElem.style.fontWeight = 'bold';
    
    // 增加趋势指示器 - 符合ISO标准
    if (title !== 'NIBP') {
        const trendIndicator = document.createElement('div');
        trendIndicator.style.marginLeft = '5px';
        trendIndicator.style.fontSize = '18px';
        // 随机生成趋势（上升/稳定/下降）
        const trends = ['↑', '→', '↓'];
        const randomTrend = trends[Math.floor(Math.random() * trends.length)];
        trendIndicator.textContent = randomTrend;
        trendIndicator.style.color = 
            randomTrend === '↑' ? '#FF9500' : 
            randomTrend === '↓' ? '#5CAAEE' : '#4CD964';
        
        valueContainer.appendChild(valueElem);
        valueContainer.appendChild(trendIndicator);
    } else {
        valueContainer.appendChild(valueElem);
    }
    
    // 判断并设置值的颜色
    if (value && isInRange(value)) {
        valueElem.style.color = color;
    } else if (value) {
        valueElem.style.color = '#FF3B30'; // 告警颜色
        // 添加告警视觉效果
        box.style.backgroundColor = 'rgba(255, 59, 48, 0.1)';
    } else {
        valueElem.style.color = color;
    }
    
    const unitElem = document.createElement('div');
    unitElem.textContent = unit;
    unitElem.style.fontSize = '14px';
    unitElem.style.color = '#AAA';
    unitElem.style.marginBottom = '5px';
    valueContainer.appendChild(unitElem);
    
    box.appendChild(valueContainer);
    
    // 添加正常范围指示 - 符合ISO标准的多层级显示
    if (normalRange) {
        const bottomInfoRow = document.createElement('div');
        bottomInfoRow.style.display = 'flex';
        bottomInfoRow.style.justifyContent = 'space-between';
        bottomInfoRow.style.marginTop = '2px';
        
        const normalRangeElem = document.createElement('div');
        normalRangeElem.textContent = `Normal: ${normalRange}`;
        normalRangeElem.style.fontSize = '12px';
        normalRangeElem.style.color = '#777';
        bottomInfoRow.appendChild(normalRangeElem);
        
        // 时间戳
        const timestampElem = document.createElement('div');
        const now = new Date();
        const timeString = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        timestampElem.textContent = timeString;
        timestampElem.style.fontSize = '11px';
        timestampElem.style.color = '#555';
        bottomInfoRow.appendChild(timestampElem);
        
        box.appendChild(bottomInfoRow);
    }
    
    return box;
}

// 启动呼吸波形模拟
function startRespirationSimulation(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#4CD964'; // 绿色
    ctx.lineWidth = 2;
    
    let x = 0;
    // 呼吸波形模式 - 比ECG更平缓的正弦波
    let phase = 0;
    
    function drawRespiration() {
        // 清除一小部分画布
        ctx.clearRect(x, 0, 3, canvas.height);
        
        const centerY = canvas.height / 2;
        const amplitude = 30; // 振幅
        
        if (x === 0) {
            ctx.beginPath();
            ctx.moveTo(x, centerY);
        }
        
        // 生成呼吸波形 - 比ECG更缓慢的正弦波
        phase += 0.03;
        const nextY = centerY - Math.sin(phase) * amplitude;
        
        ctx.lineTo(x, nextY);
        ctx.stroke();
        
        // 更新x位置
        x += 2;
        if (x >= canvas.width) {
            x = 0;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.beginPath();
        }
        
        requestAnimationFrame(drawRespiration);
    }
    
    drawRespiration();
}

// 启动SpO2波形模拟
function startSpO2Simulation(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#FF9500'; // 橙色
    ctx.lineWidth = 2;
    
    let x = 0;
    // SpO2波形模式 - 类似脉搏的波形
    let phase = 0;
    
    function drawSpO2() {
        // 清除一小部分画布
        ctx.clearRect(x, 0, 3, canvas.height);
        
        const centerY = canvas.height / 2;
        const amplitude = 25; // 振幅
        
        if (x === 0) {
            ctx.beginPath();
            ctx.moveTo(x, centerY);
        }
        
        // 生成SpO2波形 - 快速上升和缓慢下降的脉搏波形
        phase += 0.05;
        let value = Math.sin(phase);
        // 使波形有更快的上升和较慢的下降
        value = value > 0 ? Math.pow(value, 0.5) : Math.pow(value, 3) * 0.5;
        const nextY = centerY - value * amplitude;
        
        ctx.lineTo(x, nextY);
        ctx.stroke();
        
        // 更新x位置
        x += 2;
        if (x >= canvas.width) {
            x = 0;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.beginPath();
        }
        
        requestAnimationFrame(drawSpO2);
    }
    
    drawSpO2();
}

// 启动NIBP波形模拟
function startNIBPSimulation(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#FF2D55'; // 红色
    ctx.lineWidth = 2;
    
    let x = 0;
    let phase = 0;
    let measuring = false;
    let measureStart = 0;
    
    function drawNIBP() {
        // 清除一小部分画布
        ctx.clearRect(x, 0, 3, canvas.height);
        
        const centerY = canvas.height / 2;
        
        if (x === 0) {
            ctx.beginPath();
            ctx.moveTo(x, centerY);
            
            // 50%的概率开始测量
            if (Math.random() > 0.995 && !measuring) {
                measuring = true;
                measureStart = Date.now();
            }
        }
        
        let nextY = centerY;
        
        // 如果正在测量，显示BP测量动画
        if (measuring) {
            const elapsed = Date.now() - measureStart;
            
            if (elapsed < 5000) { // 膨胀阶段
                const progress = elapsed / 5000;
                // 上升到一个高点
                const amplitude = 50 * progress;
                // 添加一些脉搏震动
                phase += 0.2;
                nextY = centerY - amplitude - Math.sin(phase) * 3 * progress;
            } else if (elapsed < 15000) { // 缓慢释放阶段
                const progress = (elapsed - 5000) / 10000;
                const amplitude = 50 * (1 - progress);
                // 添加越来越明显的脉搏震动
                phase += 0.2;
                nextY = centerY - amplitude - Math.sin(phase) * (5 + 10 * progress);
            } else {
                measuring = false; // 测量完成
            }
        } else {
            // 不测量时显示平缓的基线
            nextY = centerY;
        }
        
        ctx.lineTo(x, nextY);
        ctx.stroke();
        
        // 更新x位置
        x += 2;
        if (x >= canvas.width) {
            x = 0;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.beginPath();
        }
        
        requestAnimationFrame(drawNIBP);
    }
    
    drawNIBP();
}

// 模拟更新生命体征数值
function updateVitalSigns(container) {
    // 随机变化一些值，模拟实时数据

    // 心率
    const hrValue = container.querySelector(':nth-child(1) .value-container div:first-child');
    const currentHR = parseInt(hrValue.textContent);
    const newHR = Math.max(60, Math.min(100, currentHR + Math.floor(Math.random() * 7) - 3));
    hrValue.textContent = newHR;
    
    // 呼吸
    const respValue = container.querySelector(':nth-child(2) .value-container div:first-child');
    const currentResp = parseInt(respValue.textContent);
    const newResp = Math.max(12, Math.min(24, currentResp + Math.floor(Math.random() * 3) - 1));
    respValue.textContent = newResp;
    
    // 血氧
    const spo2Value = container.querySelector(':nth-child(3) .value-container div:first-child');
    const currentSpo2 = parseInt(spo2Value.textContent);
    const newSpo2 = Math.max(95, Math.min(100, currentSpo2 + Math.floor(Math.random() * 3) - 1));
    spo2Value.textContent = newSpo2;
    
    // 血压 - 只有在未显示测量过程时才更新
    const bpSys = container.querySelector(':nth-child(4) .value-container div:nth-child(1) div:nth-child(2)');
    const bpDia = container.querySelector(':nth-child(4) .value-container div:nth-child(2) div:nth-child(2)');
    const bpMap = container.querySelector(':nth-child(4) .value-container div:nth-child(3) div:nth-child(2)');
    
    // 10%的概率更新血压值
    if (Math.random() > 0.9) {
        const currentSys = parseInt(bpSys.textContent);
        const currentDia = parseInt(bpDia.textContent);
        
        const newSys = Math.max(100, Math.min(140, currentSys + Math.floor(Math.random() * 11) - 5));
        const newDia = Math.max(60, Math.min(90, currentDia + Math.floor(Math.random() * 9) - 4));
        const newMap = Math.round(newDia + (newSys - newDia) / 3);
        
        bpSys.textContent = newSys;
        bpDia.textContent = newDia;
        bpMap.textContent = newMap;
    }
    
    // 体温
    const tempValue = container.querySelector(':nth-child(5) .value-container div:first-child');
    const currentTemp = parseFloat(tempValue.textContent);
    const newTemp = Math.max(36.0, Math.min(37.5, currentTemp + (Math.random() * 0.2 - 0.1))).toFixed(1);
    tempValue.textContent = newTemp;
}

// 启动ECG波形模拟 - 符合ISO 62366-1:2015标准
function startECGSimulation(canvas) {
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    // 根据ISO标准使用高对比度的蓝色 - 相比红色和绿色，蓝色对眼睛疲劳更小
    ctx.strokeStyle = '#5CAAEE'; 
    // 保持适当的线宽 - 太细看不清，太粗遮挡细节
    ctx.lineWidth = 2.5;
    
    // 创建ECG II导联波形数组 - 正常窦性心律模板 (P波-QRS复合波-T波)
    // 这个模板基于实际ECG形态学特征
    const createECGPattern = () => {
        const pattern = [];
        // ISO基线（等电位线）
        for (let i = 0; i < 20; i++) {
            pattern.push(0);
        }
        // P波 (心房去极化) - II导联P波更明显突出
        for (let i = 0; i < 10; i++) {
            pattern.push(Math.sin(i/10 * Math.PI) * 15);
        }
        // PR间期 (房室传导延迟)
        for (let i = 0; i < 5; i++) {
            pattern.push(0);
        }
        // QRS复合波 (心室去极化) - II导联特征
        pattern.push(-5);  // Q波（浅）
        pattern.push(-10); 
        pattern.push(60);  // R波（高）
        pattern.push(50);
        pattern.push(-15); // S波（深）
        // ST段 - II导联通常ST段略上斜
        for (let i = 0; i < 8; i++) {
            pattern.push(5 + i * 0.5);
        }
        // T波 (心室复极化) - II导联T波明显
        for (let i = 0; i < 15; i++) {
            pattern.push(10 + Math.sin(i/15 * Math.PI) * 20);
        }
        // 等电位线
        for (let i = 0; i < 15; i++) {
            pattern.push(0);
        }
        
        return pattern;
    };
    
    const ecgPattern = createECGPattern();
    const patternLength = ecgPattern.length;
    
    let x = 0;
    let patternIndex = 0;
    
    // 扫描速度设为25mm/s标准，考虑到canvas大小
    const speed = 2; 
    
    // 为提高性能，预先计算随机变量
    // 用于模拟心率变异性
    let randomVariation = 0;
    
    function drawECG() {
        // 清除扫描线前方的一小块区域，而不是整个画布
        ctx.clearRect(x, 0, speed+1, canvas.height);
        
        const centerY = canvas.height / 2;
        const amplitude = 1.5; // 基础振幅乘数
        
        if (x === 0) {
            ctx.beginPath();
            ctx.moveTo(x, centerY);
            
            // 每个心动周期引入微小随机变化，模拟心率变异性
            randomVariation = (Math.random() - 0.5) * 5;
        }
        
        // 计算当前位置的ECG值
        const ecgValue = ecgPattern[patternIndex];
        const nextY = centerY - ecgValue * amplitude - randomVariation;
        
        // 绘制线段
        ctx.lineTo(x, nextY);
        ctx.stroke();
        
        // 更新索引
        patternIndex = (patternIndex + 1) % patternLength;
        
        // 更新x位置
        x += speed;
        if (x >= canvas.width) {
            x = 0;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.beginPath();
        }
        
        // 使用requestAnimationFrame确保流畅的动画
        requestAnimationFrame(drawECG);
    }
    
    // 启动绘制
    drawECG();
    
    // 更新ECG值显示 - 在监控面板上
    function updateECGValue() {
        // 查找心率值容器
        const hrValueContainer = document.querySelector('#hospital-monitor-panel .value-container div:first-child');
        if (hrValueContainer) {
            // 产生随机心率变化
            const baseHR = 72;
            const variation = Math.floor(Math.random() * 5) - 2; // -2到+2的变化
            const newHR = baseHR + variation;
            
            // 更新心率显示
            hrValueContainer.textContent = newHR.toString();
            
            // 更新波形上的HR值显示
            const ecgValueElement = document.querySelector('#hospital-monitor-panel div[class^="createWaveformContainer"] .value-container');
            if (ecgValueElement) {
                ecgValueElement.textContent = newHR.toString();
            }
        }
        
        // 每5秒更新一次
        setTimeout(updateECGValue, 5000);
    }
    
    // 开始更新ECG值
    setTimeout(updateECGValue, 5000);
}