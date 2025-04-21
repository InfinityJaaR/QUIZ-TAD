// script.js

let questions = [];
let currentQuestionIndex = null;
let questionQueue = [];
let questionStats = {};
let totalQuestions = 0;

// Función para limpiar un campo quitando las comillas externas (si existen)
function cleanField(field) {
    if (typeof field !== 'string') return field;
    let cleaned = field.trim();
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        cleaned = cleaned.substring(1, cleaned.length - 1);
    }
    return cleaned;
}

// Función para preprocesar el CSV y corregir espacios entre campos
function preprocessCSV(data) {
    // Elimina espacios entre comillas y comas, por ejemplo: "valor", "valor" → "valor","valor"
    return data.replace(/"\s*,\s*"/g, '","');
}

// Función para parsear el CSV usando Papa Parse y recomponer campos mal separados
function parseCSV(data) {
    data = preprocessCSV(data);
    let parsedData = Papa.parse(data, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        delimiter: ",",
        quoteChar: '"',
        escapeChar: '"',
        trim: true,
        trimHeaders: true
    });

    // Antes de continuar, recorremos cada fila para reemplazar las secuencias de escape \" por una comilla normal
    parsedData.data.forEach(row => {
        Object.keys(row).forEach(key => {
            if (typeof row[key] === 'string') {
                row[key] = row[key].replace(/\\"/g, '"');
            }
        });
    });

    // Los encabezados esperados:
    const expectedHeaders = [
        'Pregunta',
        'Opción Correcta',
        'Opción Incorrecta 1',
        'Opción Incorrecta 2',
        'Opción Incorrecta 3',
        'Contexto'
    ];
    // Para cada fila, si se detectan más columnas de las esperadas, se asume que
    // las columnas extra pertenecen a "Opción Incorrecta 3" y se combinan.
    parsedData.data.forEach((row, index) => {
        // Si faltan encabezados, se completan con cadena vacía
        expectedHeaders.forEach(header => {
            if (!row.hasOwnProperty(header)) {
                row[header] = "";
            }
        });
        // Si se han creado columnas extra (por ejemplo "Opción Incorrecta 3.1"), las combinamos con "Opción Incorrecta 3"
        Object.keys(row).forEach(key => {
            if (
                key.startsWith('Opción Incorrecta') &&
                key !== 'Opción Incorrecta 1' &&
                key !== 'Opción Incorrecta 2' &&
                key !== 'Opción Incorrecta 3'
            ) {
                row['Opción Incorrecta 3'] = (row['Opción Incorrecta 3'] || "") + ", " + row[key];
                delete row[key];
            }
        });

        // Limpiar cada campo con cleanField
        row['Pregunta'] = cleanField(row['Pregunta']);
        row['Opción Correcta'] = cleanField(row['Opción Correcta']);
        row['Contexto'] = cleanField(row['Contexto'] || "");
        for (let i = 1; i <= 3; i++) {
            let key = 'Opción Incorrecta ' + i;
            row[key] = cleanField(row[key] || "");
        }

        // Si no hay pregunta u opción correcta, omitir la fila
        if (!row['Pregunta'] || !row['Opción Correcta']) {
            console.warn(`Fila ${index + 2} omitida: Falta pregunta o respuesta correcta.`);
            return;
        }

        // Armar arreglo de opciones incorrectas (sin vacíos)
        let incorrectas = [];
        for (let i = 1; i <= 3; i++) {
            let key = 'Opción Incorrecta ' + i;
            if (row[key] && row[key] !== "") {
                incorrectas.push(row[key]);
            }
        }

        questions.push({
            pregunta: row['Pregunta'],
            correctAnswer: row['Opción Correcta'],
            incorrectAnswers: incorrectas,
            contexto: row['Contexto']
        });
    });
    totalQuestions = questions.length;
}

// Cargar el CSV y vincular botones cuando el documento esté listo
document.addEventListener('DOMContentLoaded', function() {
    loadCSV('questions.csv');

    let saveBtn = document.getElementById('save-progress');
    let loadBtn = document.getElementById('load-progress');

    if (saveBtn) {
        saveBtn.addEventListener('click', saveProgressToFile);
    }
    if (loadBtn) {
        loadBtn.addEventListener('click', loadProgressFromFile);
    }
});

// Función para cargar el CSV
function loadCSV(file) {
    fetch(file)
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.text();
    })
    .then(data => {
        parseCSV(data);
        initializeQuiz();
    })
    .catch(error => console.error('Error al cargar el archivo CSV:', error));
}

// Resto del código (initializeQuiz, buildQuestionQueue, displayQuestion, checkAnswer, etc.)
// Se mantiene sin cambios

function initializeQuiz() {
    loadState();
    if (!questionStats || Object.keys(questionStats).length === 0) {
        questions.forEach((question, index) => {
            questionStats[index] = {
                repetitionsRemaining: 3,
                lastAskedAt: null
            };
        });
    }
    if (!questionQueue || questionQueue.length === 0) {
        buildQuestionQueue();
    }
    showNextQuestion();
}

function buildQuestionQueue() {
    questionQueue = [];
    let questionsToAsk = [];
    for (let index in questionStats) {
        let stats = questionStats[index];
        let reps = stats.repetitionsRemaining;
        if (reps > 0) {
            for (let i = 0; i < reps; i++) {
                questionsToAsk.push(parseInt(index));
            }
        }
    }
    questionQueue = shuffleArray(questionsToAsk);
    for (let i = 1; i < questionQueue.length; i++) {
        if (questionQueue[i] === questionQueue[i - 1]) {
            let swapIndex = Math.floor(Math.random() * (i - 1));
            if (swapIndex !== i) {
                let temp = questionQueue[i];
                questionQueue[i] = questionQueue[swapIndex];
                questionQueue[swapIndex] = temp;
            }
        }
    }
}

function showNextQuestion() {
    if (questionQueue.length === 0) {
        let totalRepetitionsRemaining = getTotalRepetitionsRemaining();
        if (totalRepetitionsRemaining > 0) {
            buildQuestionQueue();
            if (questionQueue.length === 0) {
                showCompletionMessage();
                return;
            }
        } else {
            showCompletionMessage();
            return;
        }
    }
    currentQuestionIndex = questionQueue.shift();
    displayQuestion(currentQuestionIndex);
}

function showCompletionMessage() {
    const quizDiv = document.getElementById('quiz');
    quizDiv.innerHTML = '<h2 class="completed-message">¡Has concluido, has memorizado todo!</h2>';
    clearState();
}

function displayQuestion(index) {
    let question = questions[index];
    let stats = questionStats[index];
    let quizDiv = document.getElementById('quiz');
    quizDiv.innerHTML = '';

    let repsDiv = document.createElement('div');
    repsDiv.className = 'reps-remaining';
    repsDiv.textContent = 'Repeticiones faltantes: ' + stats.repetitionsRemaining;
    quizDiv.appendChild(repsDiv);

    let remainingDiv = document.createElement('div');
    remainingDiv.className = 'questions-remaining';
    let totalRepsRemaining = getTotalRepetitionsRemaining();
    remainingDiv.textContent = 'Total de repeticiones restantes: ' + totalRepsRemaining;
    quizDiv.appendChild(remainingDiv);

    let questionElement = document.createElement('h2');
    questionElement.textContent = question.pregunta;
    quizDiv.appendChild(questionElement);

    // Mostrar opciones
    let optionsToDisplay = [question.correctAnswer];
    let incorrectOptions = question.incorrectAnswers.slice().filter(opt => opt.trim() !== '');
    if (incorrectOptions.length > 3) {
        incorrectOptions = shuffleArray(incorrectOptions).slice(0, 3);
    }
    optionsToDisplay = optionsToDisplay.concat(incorrectOptions);
    optionsToDisplay = shuffleArray(optionsToDisplay);
    if (optionsToDisplay.length > 4) {
        optionsToDisplay = optionsToDisplay.slice(0, 4);
    }
    optionsToDisplay.forEach((optionText, idx) => {
        let optionDiv = document.createElement('div');
        optionDiv.className = 'option';

        let keySpan = document.createElement('span');
        keySpan.className = 'key-indicator';
        keySpan.textContent = (idx + 1);

        let optionContent = document.createElement('span');
        optionContent.className = 'option-text';
        optionContent.textContent = optionText;

        optionDiv.appendChild(keySpan);
        optionDiv.appendChild(optionContent);

        optionDiv.dataset.optionIndex = idx + 1;
        optionDiv.addEventListener('click', function() {
            checkAnswer(optionText, index, optionDiv);
        });
        quizDiv.appendChild(optionDiv);
    });

    // Botón para "Olvidar intento"
    let forgetButton = document.createElement('button');
    forgetButton.id = 'forget-button';
    forgetButton.textContent = 'Olvidar intento';
    forgetButton.style.marginTop = '20px';
    forgetButton.addEventListener('click', function() {
        // Reducir una repetición, sin bajar de 0
        if (questionStats[index].repetitionsRemaining > 0) {
            questionStats[index].repetitionsRemaining -= 1;
        }
        saveState();
        showNextQuestion();
    });
    quizDiv.appendChild(forgetButton);

    // Capturar eventos de teclado
    document.onkeydown = function(e) {
        if (e.key >= '1' && e.key <= '4') {
            let optionIndex = parseInt(e.key) - 1;
            let optionDivs = document.querySelectorAll('.option');
            if (optionDivs[optionIndex]) {
                optionDivs[optionIndex].click();
            }
        } else if (e.code === 'Space') {
            let nextButton = document.getElementById('next-button');
            if (nextButton) {
                nextButton.click();
            }
        }
    }
}


function checkAnswer(selectedOption, questionIndex, optionDiv) {
    let question = questions[questionIndex];
    let optionsDivs = document.querySelectorAll('.option');
    optionsDivs.forEach(div => {
        div.classList.add('hidden');
    });
    optionDiv.classList.remove('hidden');
    if (selectedOption === question.correctAnswer) {
        optionDiv.classList.add('correct');
        questionStats[questionIndex].repetitionsRemaining -= 1;
        if (questionStats[questionIndex].repetitionsRemaining < 0) {
            questionStats[questionIndex].repetitionsRemaining = 0;
        }
    } else {
        optionDiv.classList.add('incorrect');
        questionStats[questionIndex].repetitionsRemaining += 1;
        let correctAnswerDiv = document.createElement('div');
        correctAnswerDiv.className = 'correct-answer';
        correctAnswerDiv.textContent = 'La respuesta correcta es: ' + question.correctAnswer;
        document.getElementById('quiz').appendChild(correctAnswerDiv);
    }
    if (question.contexto && question.contexto.trim() !== "") {
        let contextDiv = document.createElement('div');
        contextDiv.className = 'context-info';
        contextDiv.textContent = question.contexto;
        document.getElementById('quiz').appendChild(contextDiv);
    }
    let nextButton = document.createElement('button');
    nextButton.id = 'next-button';
    let spaceSpan = document.createElement('span');
    spaceSpan.className = 'key-indicator space';
    spaceSpan.textContent = '⎵';
    let nextButtonContent = document.createElement('span');
    nextButtonContent.className = 'button-text';
    nextButtonContent.textContent = 'Siguiente';
    nextButton.appendChild(spaceSpan);
    nextButton.appendChild(nextButtonContent);
    nextButton.addEventListener('click', function() {
        saveState();
        showNextQuestion();
    });
    document.getElementById('quiz').appendChild(nextButton);
    document.onkeydown = function(e) {
        if (e.code === 'Space') {
            let nextButton = document.getElementById('next-button');
            if (nextButton) {
                nextButton.click();
            }
        }
    }
}

function getTotalRepetitionsRemaining() {
    return Object.values(questionStats).reduce((sum, stats) => sum + stats.repetitionsRemaining, 0);
}

function shuffleArray(array) {
    let currentIndex = array.length, temporaryValue, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }
    return array;
}

function saveState() {
    let state = {
        questionStats: questionStats,
        questionQueue: [currentQuestionIndex, ...questionQueue]
    };
    localStorage.setItem('quizState', JSON.stringify(state));
}

function loadState() {
    let stateJSON = localStorage.getItem('quizState');
    if (stateJSON) {
        try {
            let state = JSON.parse(stateJSON);
            questionStats = state.questionStats;
            questionQueue = state.questionQueue;
        } catch (error) {
            console.error('Error al parsear el estado almacenado:', error);
            questionStats = {};
            questionQueue = [];
        }
    }
}

function clearState() {
    localStorage.removeItem('quizState');
}

function saveProgressToFile() {
    let state = {
        questionStats: questionStats,
        questionQueue: [currentQuestionIndex, ...questionQueue]
    };
    let stateJSON = JSON.stringify(state, null, 2);
    let blob = new Blob([stateJSON], { type: "application/json" });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = 'quizProgress.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function loadProgressFromFile() {
    let fileInput = document.getElementById('file-input');
    fileInput.click();
    fileInput.onchange = function(event) {
        let file = event.target.files[0];
        if (!file) return;
        let reader = new FileReader();
        reader.onload = function(e) {
            try {
                let state = JSON.parse(e.target.result);
                questionStats = state.questionStats || {};
                questionQueue = state.questionQueue || [];
                showNextQuestion();
            } catch (error) {
                console.error("Error al cargar el progreso:", error);
            }
        };
        reader.readAsText(file);
        fileInput.value = "";
    };
}
