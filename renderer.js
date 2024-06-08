const translations = require('./translations.json');

const title = document.querySelector('h1');
const taskInput = document.querySelector('#taskInput');
const taskBtn = document.querySelector('button');
const backupButton = document.getElementById('backupButton');

title.innerText = translations.urd.title;
taskInput.setAttribute('placeholder', translations.urd.input_placeholder_text);
taskBtn.innerText = translations.urd.add_task_btn;
backupButton.innerText = translations.urd.backup_button;

const { ipcRenderer } = require('electron');

document.getElementById('addTaskForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const task = document.getElementById('taskInput').value;
  ipcRenderer.send('add-task', task);
  document.getElementById('taskInput').value = '';
});

ipcRenderer.on('tasks', (event, tasks) => {
  const taskList = document.getElementById('taskList');
  taskList.innerHTML = '';
  tasks.forEach((task) => {
    const li = document.createElement('li');
    li.textContent = task.task;
    taskList.appendChild(li);
  });
});

window.onload = () => {
  ipcRenderer.send('get-tasks');
};

ipcRenderer.on('task-added', (event, task) => {
  const taskList = document.getElementById('taskList');
  const li = document.createElement('li');
  li.textContent = task.task;
  taskList.appendChild(li);
});

document.getElementById('backupButton').addEventListener('click', () => {
  ipcRenderer.send('backup-database');
});
