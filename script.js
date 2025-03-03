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
                updateStatus("已检测到人手");
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
                updateStatus("没有检测到人手");
                lastHandsDetected = false;
            }
            
            // 如果手部消失但仍处于捏合状态，触发松开
            if (isPinching) {
                console.log('手部消失，结束当前手势');
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
        
        // 在任何操作之前，先绘制捏合效果点
        // 根据状态使用不同颜色
        let pointColor;
        let pointSize = 15;
        
        if (isDragging) {
            // 拖拽模式 - 橙色
            pointColor = 'rgba(255, 100, 0, 0.6)';
            pointSize = 18; // 稍微大一点以示区别
        } else if (currentTime - pinchStartTime > 3000) {
            // 即将进入拖拽模式 - 橙红色
            pointColor = 'rgba(255, 80, 0, 0.6)';
            pointSize = 16;
        } else {
            // 普通捏合 - 蓝色
            pointColor = 'rgba(0, 100, 255, 0.6)';
        }
        
        // 绘制圆点
        ctx.beginPath();
        ctx.arc(midDispX, midDispY, pointSize, 0, 2 * Math.PI);
        ctx.fillStyle = pointColor;
        ctx.fill();
        
        // 如果是刚开始捏合
        if (!isPinching) {
            console.log('检测到捏合手势，触发鼠标按下事件', {x: midClickX, y: midClickY});
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
                
                // 显示特殊的地球交互指示器
                ctx.beginPath();
                ctx.arc(midDispX, midDispY, 15, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(0, 255, 255, 0.6)'; // 青色表示地球交互
                ctx.fill();
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
                console.log('地球交互结束');
                window._isEarthInteraction = false;
                window._earthDragStart = null;
            } else if (isDragging) {
                // 结束拖拽
                console.log('捏合手势结束，结束拖拽');
                triggerDragEnd(midClickX, midClickY);
                isDragging = false;
                dragElement = null;
            } else {
                // 普通点击结束
                console.log('捏合手势结束，触发鼠标松开事件');
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
    console.log('触发鼠标按下事件:', x, y);
    
    // 创建点击反馈效果
    createClickEffect(x, y, 'rgba(0, 100, 255, 0.3)'); // 使用较浅的蓝色表示按下状态
    
    // 获取点击位置的元素
    const element = document.elementFromPoint(x, y);
    
    // 检查是否点击在地球容器上
    if (element && isClickOnEarthContainer(element)) {
        console.log('点击在地球上，将通过THREE.js处理');
        window._isEarthInteraction = true; // 标记为地球交互
        // 仍然保存位置以便在松开时使用
        window._lastPinchPosition = {x, y};
        return; // 不创建鼠标事件，让THREE.js的控制器处理
    }
    
    // 如果找到元素，触发鼠标按下事件
    if (element) {
        console.log('找到元素:', element.tagName, element.className);
        
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
            console.log(`触发鼠标按下事件成功 at (${x}, ${y}) on:`, element);
            
            // 保存当前元素，以便在松开时使用
            window._lastPinchElement = element;
            window._lastPinchPosition = {x, y};
            window._isEarthInteraction = false; // 标记为非地球交互
        } catch (error) {
            console.error('触发鼠标按下事件失败:', error);
        }
    } else {
        console.log('在坐标点找不到元素:', x, y);
    }
}

// 修改 triggerMouseUp 函数
function triggerMouseUp(x, y) {
    console.log('触发鼠标松开事件:', x, y);
    
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
        console.log('在元素上完成点击:', element.tagName, element.className);
        
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
            console.log(`触发鼠标松开事件成功 at (${lastPosition.x}, ${lastPosition.y}) on:`, element);
            
            // 然后触发点击事件
            element.dispatchEvent(clickEvent);
            console.log(`触发点击事件成功 at (${lastPosition.x}, ${lastPosition.y}) on:`, element);
            
            // 清除缓存的元素和位置
            window._lastPinchElement = null;
            window._lastPinchPosition = null;
        } catch (error) {
            console.error('触发鼠标松开或点击事件失败:', error);
        }
    } else {
        console.log('完成点击但找不到之前的元素');
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
            console.log('计算器按钮直接点击:', btn);
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
            
            console.log('开始拖动计算器');
            
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
            console.log('停止拖动计算器');
        }
    });

    // 确保拖动离开窗口时也能停止
    document.addEventListener('mouseleave', () => {
        if (isCalcDragging) { // 使用新变量名
            isCalcDragging = false;
            // 恢复原来的z-index
            calculator.style.zIndex = '1000';
            console.log('停止拖动计算器 (离开窗口)');
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
    sidebar.style.width = '250px';
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
    title.textContent = '手势控制网页应用';
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
    label.textContent = '计算器';
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
    videoLabel.textContent = '摄像头视频';
    videoLabel.style.fontSize = '22px';
    videoLabel.style.fontWeight = '500';
    videoLabel.style.color = '#1d1d1f';
    
    // 创建录屏开关
    const videoToggleSwitch = document.createElement('div');
    videoToggleSwitch.id = 'video-toggle';
    videoToggleSwitch.className = 'toggle-switch';
    videoToggleSwitch.style.position = 'relative';
    videoToggleSwitch.style.width = '80px';
    videoToggleSwitch.style.height = '50px';
    videoToggleSwitch.style.backgroundColor = '#34c759'; // 默认是绿色（开启状态）
    videoToggleSwitch.style.borderRadius = '25px';
    videoToggleSwitch.style.cursor = 'pointer';
    videoToggleSwitch.style.transition = 'background-color 0.3s';
    
    // 创建录屏开关滑块
    const videoSlider = document.createElement('div');
    videoSlider.style.position = 'absolute';
    videoSlider.style.top = '3px';
    videoSlider.style.left = '34px'; // 默认在右侧（开启状态）
    videoSlider.style.width = '44px';
    videoSlider.style.height = '44px';
    videoSlider.style.borderRadius = '50%';
    videoSlider.style.backgroundColor = 'white';
    videoSlider.style.boxShadow = '0 3px 8px rgba(0, 0, 0, 0.2)';
    videoSlider.style.transition = 'left 0.3s';
    videoToggleSwitch.appendChild(videoSlider);
    
    // 录屏组件的显示/隐藏状态
    let videoVisible = true;
    const inputVideo = document.getElementById('input-video');
    
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
    
    document.body.appendChild(sidebar);
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
        
        // 创建侧边导航面板
        createSidebar();
        
        // 创建虚拟宇宙和地球
        createVirtualEarth();
    } catch (error) {
        console.error("应用启动失败:", error);
        updateStatus("应用启动失败，请刷新页面重试");
    }
}

// 启动应用
window.addEventListener('load', startApp);

// 触发拖拽开始
function triggerDragStart(x, y) {
    console.log('开始拖拽操作:', x, y);
    
    // 创建拖拽开始反馈效果
    createClickEffect(x, y, 'rgba(255, 100, 0, 0.5)'); // 橙色表示拖拽开始
    
    // 保存初始拖拽位置
    window._dragStartPosition = {x, y};
    
    if (dragElement) {
        console.log('拖拽元素:', dragElement.tagName, dragElement.className);
        
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
        else if (position === 'absolute') {
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
    console.log('结束拖拽操作:', x, y);
    
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
        
        console.log('拖拽结束，元素位置:', dragElement._dragOffset);
    }
    
    // 清除拖拽数据
    window._dragStartPosition = null;
} 